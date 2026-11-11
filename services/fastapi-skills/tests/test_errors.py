"""One error shape, request IDs and redacted logs (#512)."""
import io
import json
import logging
from pathlib import Path
import pytest
from fastapi import HTTPException
from app.main import app
from app.security import trusted_node
from app.errors import JsonFormatter, RequestIdFilter, log, owner_hash, classify
from app.registry import RegistryError
from support import MD, make_parts

DATA = Path(__file__).resolve().parent.parent / 'data'
OWNER = 'usr_Secret-Owner-Key'
SECRET = 'premium-tone'  # text inside MD: must never appear in an error or a log


@pytest.fixture
def ctx(serve):
    parts = make_parts()
    svc, registry = parts.service, parts.registry
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdFilter())
    log.addHandler(handler)
    client = serve(parts, OWNER, raise_server_exceptions=False)
    try:
        yield client, svc, registry, stream
    finally:
        log.removeHandler(handler)


def lines(stream):
    return [json.loads(line) for line in stream.getvalue().splitlines()]


def create(client):
    response = client.post('/v1/skills', json={'slug': 'premium-copy', 'display_name': 'Premium Copy', 'description': 'Writes compliant short brand copy'})
    assert response.status_code == 202
    return response.json()['skillId']


def error(response):
    body = response.json()
    assert set(body) == {'error'}
    assert {'code', 'message', 'requestId', 'retryable'} <= set(body['error'])
    assert body['error']['requestId'] == response.headers['X-Request-Id']
    return body['error']


def test_not_found_has_the_shape_and_echoes_the_request_id(ctx):
    client, *_ = ctx
    response = client.get('/v1/skills/nope', headers={'X-Request-Id': 'node-req-12345'})
    assert response.status_code == 404
    err = error(response)
    assert err['code'] == 'resource_not_accessible' and err['retryable'] is False
    assert err['requestId'] == 'node-req-12345'


def test_a_request_id_is_made_when_absent_or_unsafe(ctx):
    client, *_ = ctx
    made = client.get('/healthz').headers['X-Request-Id']
    assert len(made) == 32
    unsafe = client.get('/healthz', headers={'X-Request-Id': 'bad id\nwith newline'}).headers['X-Request-Id']
    assert unsafe != 'bad id\nwith newline' and len(unsafe) == 32
    assert client.get('/healthz', headers={'X-Request-Id': 'x' * 129}).headers['X-Request-Id'] != 'x' * 129


def test_request_validation_lists_issues_without_echoing_input(ctx):
    client, *_ = ctx
    sid = create(client)
    response = client.post(f'/v1/skills/{sid}/publish', json={'markdown': MD, 'tool_names': 'brand.read'}, headers={'Idempotency-Key': 'key-12345678'})
    assert response.status_code == 422
    err = error(response)
    assert err['code'] == 'validation_failed'
    assert any(issue['path'] == 'body.tool_names' for issue in err['issues'])
    assert SECRET not in response.text


def test_unapproved_tool_names_the_tools_and_the_catalog_revision(ctx):
    client, svc, *_ = ctx
    sid = create(client)
    md = MD.replace('description:', 'allowed-tools: [shell.exec]\ndescription:', 1)
    response = client.post(f'/v1/skills/{sid}/publish', json={'markdown': md, 'tool_names': ['shell.exec']}, headers={'Idempotency-Key': 'key-12345678'})
    assert response.status_code == 422
    err = error(response)
    assert err['code'] == 'tool_not_approved'
    assert [i['tool'] for i in err['issues']] == ['shell.exec']
    assert err['catalogRevision'].startswith('file-v1-')


def test_declared_but_unlisted_tool_is_a_validation_issue(ctx):
    client, *_ = ctx
    sid = create(client)
    md = MD.replace('description:', 'allowed-tools: [brand.read]\ndescription:', 1)
    response = client.post(f'/v1/skills/{sid}/publish', json={'markdown': md, 'tool_names': []}, headers={'Idempotency-Key': 'key-12345678'})
    err = error(response)
    assert err['code'] == 'validation_failed'
    assert err['issues'][0]['code'] == 'tool_not_listed' and err['issues'][0]['tool'] == 'brand.read'


def test_idempotency_conflict_and_a_held_publish_lock(ctx):
    client, svc, *_ = ctx
    sid = create(client)
    first = client.post(f'/v1/skills/{sid}/publish', json={'markdown': MD, 'tool_names': ['brand.read']}, headers={'Idempotency-Key': 'key-12345678'})
    assert first.status_code == 202
    reused = client.post(f'/v1/skills/{sid}/publish', json={'markdown': MD + '\nMore\n', 'tool_names': ['brand.read']}, headers={'Idempotency-Key': 'key-12345678'})
    assert (reused.status_code, error(reused)['code'], error(reused)['retryable']) == (409, 'idempotency_conflict', False)
    # Keep the first publish running in the Registry, so its lock stays held.
    svc.store.patch_operation(first.json()['operation_id'], {'status': 'publishing', 'registryOperation': 'ops/running'})

    async def running(name):
        return {'name': name, 'done': False}
    svc.registry.operation = running
    held = client.post(f'/v1/skills/{sid}/publish', json={'markdown': MD + '\nMore\n', 'tool_names': ['brand.read']}, headers={'Idempotency-Key': 'key-87654321'})
    assert (held.status_code, error(held)['code'], error(held)['retryable']) == (409, 'publish_in_progress', True)


def test_registry_errors_keep_their_status_never_their_body(ctx):
    client, svc, registry, _ = ctx
    sid = create(client)

    async def broken(resource):
        raise RegistryError(503, 'upstream said: projects/p/skills/x token=abc ' + SECRET)
    registry.get_skill = broken
    response = client.get(f'/v1/skills/{sid}')
    assert response.status_code == 503
    err = error(response)
    assert err['code'] == 'dependency_unavailable' and err['retryable'] is True
    assert 'token' not in response.text and SECRET not in response.text and 'projects/' not in response.text


def test_unexpected_failure_is_an_internal_error_without_its_text(ctx):
    client, svc, *_ = ctx

    def explode(*_):
        raise RuntimeError('boom with ' + OWNER)
    svc.list_owned = explode
    response = client.get('/v1/skills')
    assert response.status_code == 500
    err = error(response)
    assert err['code'] == 'internal_error'
    assert 'boom' not in response.text and OWNER not in response.text


def test_logs_are_json_with_the_request_id_and_no_secrets(ctx):
    client, svc, _, stream = ctx
    sid = create(client)
    client.post(f'/v1/skills/{sid}/publish', json={'markdown': MD, 'tool_names': ['brand.read']},
                headers={'Idempotency-Key': 'key-12345678', 'X-Request-Id': 'node-req-77777', 'X-Owner-Key': OWNER,
                         'Authorization': 'Bearer secret-token-value'})
    client.get('/v1/skills/nope', headers={'X-Request-Id': 'node-req-88888'})
    rows = lines(stream)
    publish = next(r for r in rows if r.get('requestId') == 'node-req-77777')
    assert publish['route'] == '/v1/skills/{skill_id}/publish' and publish['method'] == 'POST'
    assert publish['status'] == 202 and isinstance(publish['latencyMs'], float)
    assert publish['ownerHash'] == owner_hash(OWNER)
    missing = next(r for r in rows if r.get('requestId') == 'node-req-88888')
    assert missing['errorCode'] == 'resource_not_accessible'
    text = stream.getvalue()
    for leaked in (OWNER, SECRET, 'secret-token-value', 'Bearer'):
        assert leaked not in text
    assert all(r['requestId'] not in ('', '-') for r in rows)


def test_the_unhandled_error_log_line_has_the_request_id(ctx):
    client, svc, _, stream = ctx
    svc.list_owned = lambda *_: (_ for _ in ()).throw(RuntimeError('secret detail'))
    client.get('/v1/skills', headers={'X-Request-Id': 'node-req-99999'})
    rows = [r for r in lines(stream) if r['requestId'] == 'node-req-99999']
    assert [r['message'] for r in rows] == ['unhandled error', 'request']
    assert rows[0]['errorType'] == 'RuntimeError'
    assert 'secret detail' not in stream.getvalue()


def test_a_code_comes_from_the_raise_never_from_the_message(ctx):
    # #531: the message no longer decides the code; the ServiceError's own code does.
    assert classify(422, 'Maximum five Skills per user')[0] == 'validation_failed'
    assert classify(422, 'Maximum five Skills per user', 'quota_exceeded')[0] == 'quota_exceeded'
    # Without a code (FastAPI's own errors), the status decides.
    assert classify(429, 'Too many')[0] == 'rate_limited'
    assert classify(503, 'x')[0] == 'dependency_unavailable'
    assert classify(401, 'x')[0] == 'unauthenticated'
    assert classify(403, 'x')[0] == 'forbidden'
    assert classify(409, 'x')[0] == 'conflict'
    assert classify(422, {'unknown': 1})[1] == 'The request is not valid'


def test_auth_failure_has_the_shape(ctx):
    client, *_ = ctx

    def deny():
        raise HTTPException(401, detail='Missing service ID token')
    app.dependency_overrides[trusted_node] = deny
    response = client.get('/v1/skills')
    assert (response.status_code, error(response)['code']) == (401, 'unauthenticated')
