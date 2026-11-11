"""The service boundary (#513): only the Node BFF's service account, with a
well-formed owner key, gets in; and an owner only ever reaches their own Skills.
A fake token verifier stands in for Google: nothing here calls out."""
import pytest
from fastapi.testclient import TestClient
from google.oauth2 import id_token
from app import config
from app.main import app, service, catalog, helper
from app.catalog import ToolCatalog
from app.config import Settings
from app.service import SkillService
from app.store import MemoryStore
from test_service import FakeRegistry, MD
from pathlib import Path

AUDIENCE = 'https://fastapi.example.run.app'
NODE = 'node-bff@gcos.iam.gserviceaccount.com'

# token string → its claims. verify_token checks the audience, as Google's does.
TOKENS = {
    'node': {'iss': 'https://accounts.google.com', 'aud': AUDIENCE, 'email': NODE, 'email_verified': True},
    'other-audience': {'iss': 'https://accounts.google.com', 'aud': 'https://other.run.app', 'email': NODE, 'email_verified': True},
    'other-issuer': {'iss': 'https://evil.example.com', 'aud': AUDIENCE, 'email': NODE, 'email_verified': True},
    'unverified': {'iss': 'https://accounts.google.com', 'aud': AUDIENCE, 'email': NODE, 'email_verified': False},
    'other-service': {'iss': 'https://accounts.google.com', 'aud': AUDIENCE, 'email': 'other@gcos.iam.gserviceaccount.com', 'email_verified': True},
    # A user's Google Sign-In token: issued to the web OAuth client, not this service.
    'user-sign-in': {'iss': 'https://accounts.google.com', 'aud': '123-web.apps.googleusercontent.com', 'email': 'ana@accenture.com', 'email_verified': True, 'hd': 'accenture.com'},
}


def fake_verify(token, request, audience=None, **_):
    claims = TOKENS.get(token)
    if claims is None:
        raise ValueError('Could not verify token signature')
    if audience is not None and claims['aud'] != audience:
        raise ValueError('Token has wrong audience')
    return dict(claims)


@pytest.fixture
def client(monkeypatch):
    for key in ('DEV_BYPASS_AUTH', 'K_SERVICE'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('FASTAPI_AUDIENCE', AUDIENCE)
    monkeypatch.setenv('NODE_SERVICE_ACCOUNT', NODE)
    monkeypatch.chdir('/')
    config.settings.cache_clear()
    monkeypatch.setattr(id_token, 'verify_token', fake_verify)
    root = Path(__file__).resolve().parent.parent
    cat = ToolCatalog(root / 'data' / 'tool_catalog.json')
    svc = SkillService(MemoryStore(), FakeRegistry(), cat, Settings(google_cloud_project='test-project'))
    app.dependency_overrides[service] = lambda: svc
    app.dependency_overrides[catalog] = lambda: cat
    app.dependency_overrides[helper] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()
    config.settings.cache_clear()


def as_owner(owner='usr_ana', token='node'):
    return {'Authorization': f'Bearer {token}', 'X-Owner-Key': owner}


def create(client, owner='usr_ana', slug='brand-tone'):
    res = client.post('/v1/skills', headers=as_owner(owner), json={'slug': slug, 'display_name': 'Brand Tone', 'description': 'Applies the brand voice.'})
    assert res.status_code == 202, res.text
    return res.json()['skillId']


# ── Who may call ────────────────────────────────────────────────────────

def test_the_node_service_account_gets_in(client):
    assert client.get('/v1/skills', headers=as_owner()).status_code == 200


@pytest.mark.parametrize('headers, status', [
    ({'X-Owner-Key': 'usr_ana'}, 401),                                                   # no token
    ({'Authorization': 'Basic abc', 'X-Owner-Key': 'usr_ana'}, 401),                     # not a bearer token
    ({'Authorization': 'Bearer forged', 'X-Owner-Key': 'usr_ana'}, 401),                 # bad signature
    (as_owner(token='other-audience'), 401),                                             # for another service
    (as_owner(token='user-sign-in'), 401),                                               # a user's own Google token
    (as_owner(token='other-issuer'), 403),
    (as_owner(token='unverified'), 403),
    (as_owner(token='other-service'), 403),                                              # another service account
])
def test_anyone_else_is_refused(client, headers, status):
    assert client.get('/v1/skills', headers=headers).status_code == status


@pytest.mark.parametrize('owner', ['', 'ana', 'own_ana', 'usr_', 'usr_a/b', 'usr_../x', 'usr_ ana', 'usr_' + 'a' * 125, 'USR_ana'])
def test_a_missing_or_malformed_owner_key_is_refused_before_the_token_is_checked(client, owner):
    headers = {'Authorization': 'Bearer node'}
    if owner:
        headers['X-Owner-Key'] = owner
    assert client.get('/v1/skills', headers=headers).status_code == 401


def test_the_longest_well_formed_owner_key_gets_in(client):
    assert client.get('/v1/skills', headers=as_owner('usr_' + 'a' * 124)).status_code == 200


def test_unconfigured_caller_check_refuses_rather_than_opens(client, monkeypatch):
    monkeypatch.setenv('NODE_SERVICE_ACCOUNT', '')
    config.settings.cache_clear()
    assert client.get('/v1/skills', headers=as_owner()).status_code == 503


def test_the_dev_bypass_works_locally_only(client, monkeypatch):
    monkeypatch.setenv('DEV_BYPASS_AUTH', 'true')
    config.settings.cache_clear()
    assert client.get('/v1/skills', headers={'X-Owner-Key': 'usr_ana'}).status_code == 200
    # On Cloud Run the bypass is ignored per request (and refused at startup, test_startup.py).
    monkeypatch.setenv('K_SERVICE', 'gcos-fastapi')
    assert client.get('/v1/skills', headers={'X-Owner-Key': 'usr_ana'}).status_code == 401


def test_the_error_names_no_token_or_claims(client):
    res = client.get('/v1/skills', headers=as_owner(token='other-service'))
    assert 'other@gcos' not in res.text
    assert 'other-service' not in res.text


# ── Whose Skills ────────────────────────────────────────────────────────

def test_an_owner_never_sees_or_touches_another_owners_skill(client):
    sid = create(client, 'usr_ana')
    ben = as_owner('usr_ben')
    assert client.get('/v1/skills', headers=ben).json()['skills'] == []
    assert client.get('/v1/skills?include_disabled=true', headers=ben).json()['skills'] == []
    for method, path, body in [
        ('get', f'/v1/skills/{sid}', None),
        ('patch', f'/v1/skills/{sid}', {'display_name': 'Taken over'}),
        ('delete', f'/v1/skills/{sid}', None),
        ('get', f'/v1/skills/{sid}/revisions', None),
        ('get', f'/v1/skills/{sid}/revisions/r-1', None),
        ('get', f'/v1/skills/{sid}/revisions/r-1/download', None),
        ('post', f'/v1/skills/{sid}/publish', {'markdown': MD, 'tool_names': []}),
        ('get', f'/v1/skills/{sid}/publish-operations/op-1', None),
    ]:
        kwargs = {'headers': {**ben, 'Idempotency-Key': 'key-12345678'}}
        if body is not None:
            kwargs['json'] = body
        res = getattr(client, method)(path, **kwargs)
        assert res.status_code == 404, f'{method.upper()} {path}: {res.status_code}'
    # Ana's Skill is untouched.
    assert client.get(f'/v1/skills/{sid}', headers=as_owner('usr_ana')).json()['status'] == 'draft'


def test_a_replayed_publish_from_another_owner_gets_nothing_of_theirs(client):
    sid = create(client, 'usr_ana')
    key = {'Idempotency-Key': 'key-12345678'}
    first = client.post(f'/v1/skills/{sid}/publish', headers={**as_owner('usr_ana'), **key}, json={'markdown': MD, 'tool_names': []})
    assert first.status_code in (200, 202), first.text
    op_id = first.json()['operation_id']
    replay = client.post(f'/v1/skills/{sid}/publish', headers={**as_owner('usr_ben'), **key}, json={'markdown': MD, 'tool_names': []})
    assert replay.status_code == 404
    assert client.get(f'/v1/skills/{sid}/publish-operations/{op_id}', headers=as_owner('usr_ben')).status_code == 404


def test_the_same_slug_makes_separate_skills_for_separate_owners(client):
    assert create(client, 'usr_ana') != create(client, 'usr_ben')
