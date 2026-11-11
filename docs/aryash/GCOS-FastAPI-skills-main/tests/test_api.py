from fastapi.testclient import TestClient
from app.main import app, service, catalog, helper
from app.security import trusted_node, Principal
from app.catalog import ToolCatalog
from app.store import MemoryStore
from app.config import Settings
from app.service import SkillService
from pathlib import Path
from test_service import FakeRegistry, MD


def test_api_endpoints():
    root = Path(__file__).resolve().parent.parent
    cat = ToolCatalog(root / 'data' / 'tool_catalog.json')
    svc = SkillService(MemoryStore(), FakeRegistry(), cat, Settings())
    app.dependency_overrides[service] = lambda: svc
    app.dependency_overrides[catalog] = lambda: cat
    app.dependency_overrides[trusted_node] = lambda: Principal(owner_key='usr_A', caller_email='unit-test-node')
    try:
        if True:
            client = TestClient(app)
            # Startup Firestore should be bypassed by injecting dependencies in tests.
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
            app.dependency_overrides[trusted_node] = lambda: Principal(owner_key='usr_B', caller_email='unit-test-node')
            assert client.get(f'/v1/skills/{sid}').status_code == 404
    finally:
        app.dependency_overrides.clear()
