"""The AI draft helper, bounded and testable (#511, PACK PY-04 scope 5 and 7).
Everything runs on FakeLLMClient: no test calls a model."""
import asyncio
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from fastapi.testclient import TestClient
from app import config
from app.config import Settings
from app.llm import FakeLLMClient, GeminiClient, llm_client
from app.models import SkillDraftRequest
from app.store import MemoryStore
from app.catalog import ToolCatalog
from pathlib import Path
from support import make_parts

CATALOG = ToolCatalog(Path(__file__).resolve().parent.parent / 'data' / 'tool_catalog.json')
DRAFT = '---\nname: brand-tone\ndescription: Applies the approved brand voice.\n---\n# Purpose\nShort copy.\n'


def request(**over):
    fields = {'name': 'brand-tone', 'goal': 'Write short brand copy for images.', 'approved_tools': ['brand.read'], **over}
    return SkillDraftRequest(**fields)


def make(answers=(DRAFT,), store=None, clock=None, **cfg):
    fake = FakeLLMClient(list(answers))
    settings = Settings(google_cloud_project='test-project', **cfg)
    helper = make_parts(settings, store=store, llm=fake, catalog=CATALOG, clock=clock).helper
    return helper, fake


def draft(helper, owner='usr_A', **over):
    return asyncio.run(helper.generate(owner, request(**over)))


def refused(helper, owner='usr_A', **over):
    with pytest.raises(HTTPException) as failure:
        draft(helper, owner, **over)
    return failure.value


# ── Answers ────────────────────────────────────────────────────────────

def test_returns_a_valid_draft():
    helper, fake = make()
    result = draft(helper)
    assert result.markdown == DRAFT
    assert result.valid is True
    assert len(fake.prompts) == 1


def test_strips_code_fences_the_model_adds():
    helper, _ = make([f'```markdown\n{DRAFT}```'])
    assert draft(helper).markdown == DRAFT


@pytest.mark.parametrize('bad', ['not a skill at all', '', '```\n```', '---\nname: x\n---\n'])
def test_answers_502_for_output_that_isnt_a_skill(bad):
    helper, _ = make([bad])
    error = refused(helper)
    assert error.status_code == 502
    assert 'valid SKILL.md' in error.detail


def test_answers_503_when_the_model_is_too_slow():
    async def slow(_prompt):
        await asyncio.sleep(1)
        return DRAFT
    helper, _ = make([slow], skill_helper_timeout_seconds=0.05)
    error = refused(helper)
    assert error.status_code == 503
    assert 'too long' in error.detail


def test_answers_503_not_500_when_the_model_fails_and_names_nothing_internal():
    helper, _ = make([RuntimeError('Vertex: quota exceeded for project gcos-secret-123')])
    error = refused(helper)
    assert error.status_code == 503
    assert 'gcos-secret' not in error.detail


# ── Bounds ─────────────────────────────────────────────────────────────

def test_refuses_unapproved_tools_before_any_model_call():
    helper, fake = make()
    assert refused(helper, approved_tools=['shell.exec']).status_code == 422
    assert fake.prompts == []


@pytest.mark.parametrize('over', [
    {'constraints': ['x' * 301]},
    {'constraints': ['']},
    {'constraints': ['ok'] * 16},
    {'approved_tools': ['t' * 65]},
    {'name': 'abc'},
    {'goal': 'x' * 2501},
])
def test_refuses_oversized_input(over):
    with pytest.raises(ValidationError):
        request(**over)


def test_refuses_a_prompt_over_the_limit_before_any_model_call_and_without_counting_it():
    store = MemoryStore()
    helper, fake = make(store=store, skill_helper_max_prompt_chars=500)
    assert refused(helper, goal='x' * 600).status_code == 422
    assert fake.prompts == []
    assert store.drafts.get('usr_A', {'count': 0})['count'] == 0


# ── Rate ───────────────────────────────────────────────────────────────

def test_limits_drafts_per_owner_per_hour_and_resets_after_the_hour(clock):
    helper, fake = make(answers=[DRAFT], clock=clock, skill_helper_drafts_per_hour=3)
    for _ in range(3):
        draft(helper)
    error = refused(helper)
    assert error.status_code == 429
    assert len(fake.prompts) == 3  # the refused one never reached the model
    assert draft(helper, owner='usr_B').valid is True  # another owner has their own count
    clock.advance(3600)
    assert draft(helper).valid is True


def test_a_refused_request_does_not_use_up_the_rate():
    helper, _ = make(skill_helper_drafts_per_hour=1)
    refused(helper, approved_tools=['shell.exec'])
    assert draft(helper).valid is True


def test_a_failed_model_call_still_counts():
    helper, _ = make([RuntimeError('down'), DRAFT], skill_helper_drafts_per_hour=1)
    assert refused(helper).status_code == 503
    assert refused(helper).status_code == 429


# ── Wiring ─────────────────────────────────────────────────────────────

def test_the_backend_is_picked_by_config():
    assert isinstance(llm_client(Settings(skill_helper_backend='fake')), FakeLLMClient)
    assert isinstance(llm_client(Settings(skill_helper_backend='gemini')), GeminiClient)
    with pytest.raises(RuntimeError):
        llm_client(Settings(skill_helper_backend='other'))


def test_the_gemini_client_sends_the_configured_model_and_cap(monkeypatch):
    from google import genai
    seen = {}

    class Models:
        async def generate_content(self, model, contents, config):
            seen.update(model=model, contents=contents, tokens=config.max_output_tokens, temperature=config.temperature)
            return type('R', (), {'text': DRAFT})()

    class Aio:
        models = Models()

        async def aclose(self):
            seen['closed'] = True

    monkeypatch.setattr(genai, 'Client', lambda **kw: seen.update(client=kw) or type('C', (), {'aio': Aio()})())
    text = asyncio.run(GeminiClient(Settings(google_cloud_project='p1', vertex_location='eu', skill_helper_model='m1', skill_helper_max_output_tokens=99)).generate('hi'))
    assert text == DRAFT
    assert seen == {'client': {'vertexai': True, 'project': 'p1', 'location': 'eu'}, 'model': 'm1', 'contents': 'hi', 'tokens': 99, 'temperature': 0.2, 'closed': True}


def test_the_fake_backend_is_refused_on_cloud_run(monkeypatch):
    from app.main import app
    for key, value in {'GOOGLE_CLOUD_PROJECT': 'p', 'FIRESTORE_PROJECT_ID': 'p', 'FASTAPI_AUDIENCE': 'https://a.run.app',
                       'NODE_SERVICE_ACCOUNT': 'n@p.iam.gserviceaccount.com', 'SKILL_HELPER_BACKEND': 'fake', 'K_SERVICE': 'svc'}.items():
        monkeypatch.setenv(key, value)
    monkeypatch.chdir('/')
    config.settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match='SKILL_HELPER_BACKEND=fake'):
            with TestClient(app):
                pass
    finally:
        config.settings.cache_clear()


def test_the_route_drafts_for_the_calling_owner():
    from app.main import app, helper as helper_dep
    from app.security import trusted_node, Principal
    store = MemoryStore()
    helper, _ = make(store=store, skill_helper_drafts_per_hour=1)
    app.dependency_overrides[helper_dep] = lambda: helper
    app.dependency_overrides[trusted_node] = lambda: Principal(owner_key='usr_A', caller_email='unit-test-node')
    try:
        client = TestClient(app)
        body = {'name': 'brand-tone', 'goal': 'Write short brand copy for images.', 'approved_tools': ['brand.read']}
        assert client.post('/v1/skills/ai-draft', json=body).status_code == 200
        assert client.post('/v1/skills/ai-draft', json=body).status_code == 429
        assert store.drafts['usr_A']['count'] == 1
    finally:
        app.dependency_overrides.clear()
