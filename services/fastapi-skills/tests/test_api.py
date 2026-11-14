from app.security import trusted_node, Principal
from support import MD, make_parts


def test_api_endpoints(serve):
    client = serve(make_parts(), owner='usr_A')
    response = client.post('/v1/skills', json={
        'slug': 'premium-copy', 'display_name': 'Premium Copy',
        'description': 'Writes compliant short brand copy',
    })
    assert response.status_code == 202, response.text
    sid = response.json()['skillId']
    assert len(client.get('/v1/skills').json()['skills']) == 1
    assert client.post('/v1/tools/validate', json={'tool_names': ['brand.read']}).json()['valid']
    request = {'markdown': MD, 'tool_names': ['brand.read']}
    status = client.post(f'/v1/skills/{sid}/publish', json=request, headers={'Idempotency-Key': 'requestid123'})
    assert status.status_code == 202, status.text
    op_id = status.json()['operation_id']
    poll = client.get(f'/v1/skills/{sid}/publish-operations/{op_id}')
    assert poll.json()['status'] == 'published'
    from app.main import app
    app.dependency_overrides[trusted_node] = lambda: Principal(owner_key='usr_B', caller_email='unit-test-node')
    assert client.get(f'/v1/skills/{sid}').status_code == 404
