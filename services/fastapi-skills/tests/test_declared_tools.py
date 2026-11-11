"""The tools a SKILL.md declares are checked, not only the list sent with it (#509)."""
import pytest
from fastapi import HTTPException
from app.config import Settings
import asyncio
from app.helper import SkillHelper, draft_tool_issues
from app.llm import FakeLLMClient
from app.models import PublishRequest, SkillCreate, SkillDraftRequest
from app.packaging import declared_tools, validate_markdown
from test_service import base  # noqa: F401 (base is a fixture)


def md(tools_line=''):
    front = f'name: brand-tone\ndescription: Applies the approved brand voice.\n{tools_line}'.rstrip('\n')
    return f'---\n{front}\n---\n# Instructions\nWrite short, accurate copy.\n'


# ── Parsing ────────────────────────────────────────────────────────────

@pytest.mark.parametrize('line, expected', [
    ('', []),
    ('allowed-tools: [brand.read, image.generate]', ['brand.read', 'image.generate']),
    ('allowed-tools:\n  - brand.read\n  - asset.read', ['brand.read', 'asset.read']),
    ('allowed-tools: brand.read, image.generate', ['brand.read', 'image.generate']),
    ('allowed-tools: brand.read image.generate', ['brand.read', 'image.generate']),
    ('allowed-tools: []', []),
])
def test_reads_the_declared_tools(line, expected):
    assert declared_tools(validate_markdown(md(line))) == expected


@pytest.mark.parametrize('line, message', [
    ('allowed-tools: {brand: read}', 'must be a list'),
    ('allowed-tools: 42', 'must be a list'),
    ('allowed-tools: [42]', 'named by text'),
    ('allowed-tools: ["https://evil.example.com/mcp"]', 'never by a URL'),
    ('allowed-tools: [mcp/shell]', 'never by a URL or path'),
    ('allowed-tools: [Brand.Read]', 'not a valid tool name'),
    ('allowed-tools: ["brand read;rm"]', 'not a valid tool name'),
    ('allowed-tools: [brand.read, brand.read]', 'listed twice'),
])
def test_refuses_a_malformed_declaration(line, message):
    with pytest.raises(HTTPException) as failure:
        declared_tools(validate_markdown(md(line)))
    assert failure.value.status_code == 422
    assert any(message in e['message'] for e in failure.value.detail['tool_declaration_errors'])


def test_refuses_more_than_thirty_tools():
    names = ', '.join(f't{i}.read' for i in range(31))
    with pytest.raises(HTTPException):
        declared_tools(validate_markdown(md(f'allowed-tools: [{names}]')))


# ── Publish ────────────────────────────────────────────────────────────

async def skill(svc):
    return (await svc.create('usr_A', SkillCreate(slug='brand-tone', display_name='Brand Tone', description='Applies the brand voice.')))['skillId']


async def test_a_declared_tool_missing_from_tool_names_is_refused_before_anything_is_sent(base):
    svc, _, registry = base
    sid = await skill(svc)
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_A', sid, PublishRequest(markdown=md('allowed-tools: [brand.read, image.generate]'), tool_names=['brand.read']), 'key-12345678')
    assert failure.value.status_code == 422
    assert failure.value.detail == {'tools_not_listed': ['image.generate']}
    assert registry.revision_calls == 0


async def test_a_declared_unapproved_tool_is_refused_even_when_listed(base):
    svc, _, registry = base
    sid = await skill(svc)
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_A', sid, PublishRequest(markdown=md('allowed-tools: [shell.exec]'), tool_names=['shell.exec']), 'key-12345678')
    assert failure.value.detail['invalid_tools'] == ['shell.exec']
    assert registry.revision_calls == 0


async def test_a_malformed_declaration_is_refused_on_publish(base):
    svc, _, _ = base
    sid = await skill(svc)
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_A', sid, PublishRequest(markdown=md('allowed-tools: ["https://evil.example.com"]'), tool_names=[]), 'key-12345678')
    assert 'tool_declaration_errors' in failure.value.detail


async def test_declared_and_listed_approved_tools_publish(base):
    svc, _, registry = base
    sid = await skill(svc)
    result = await svc.publish('usr_A', sid, PublishRequest(markdown=md('allowed-tools: [brand.read]'), tool_names=['brand.read']), 'key-12345678')
    assert result.status in ('pending_activation', 'published')
    assert registry.revision_calls == 1


async def test_a_tool_free_skill_is_valid(base):
    svc, _, registry = base
    sid = await skill(svc)
    await svc.publish('usr_A', sid, PublishRequest(markdown=md(), tool_names=[]), 'key-12345678')
    assert registry.revision_calls == 1


# ── The AI helper ──────────────────────────────────────────────────────

@pytest.fixture
def helper(base):
    svc, store, _ = base

    def run(text, approved):
        fake = FakeLLMClient([text])
        h = SkillHelper(Settings(google_cloud_project='test-project'), svc.catalog, store, fake)
        result = asyncio.run(h.generate('usr_A', SkillDraftRequest(name='brand-tone', goal='Write short brand copy for images.', approved_tools=approved)))
        return result, fake
    return run


def test_the_helper_asks_the_model_to_declare_tools(helper):
    _, fake = helper(md('allowed-tools: [brand.read]'), ['brand.read'])
    assert 'allowed-tools' in fake.prompts[0]


def test_a_clean_draft_is_valid(helper):
    result, _ = helper(md('allowed-tools: [brand.read]'), ['brand.read'])
    assert result.valid is True
    assert result.issues == []


@pytest.mark.parametrize('line, code', [
    ('allowed-tools: [artifact.write]', 'tool_not_requested'),   # approved in the catalog, not asked for
    ('allowed-tools: [shell.exec]', 'tool_not_approved'),
    ('allowed-tools: ["https://evil.example.com"]', 'tool_declaration'),
])
def test_a_draft_with_tool_problems_comes_back_with_issues_not_clean(helper, line, code):
    result, _ = helper(md(line), ['brand.read'])
    assert result.valid is False
    assert [i.code for i in result.issues] == [code]
    assert 'need fixing' in result.warning
    assert result.markdown  # the draft itself is still returned, for the user to fix


def test_draft_tool_issues_names_each_bad_tool(base):
    svc, _, _ = base
    issues = draft_tool_issues(md('allowed-tools: [brand.read, shell.exec, artifact.write]'), ['brand.read'], svc.catalog)
    assert [(i.path, i.code) for i in issues] == [('allowed-tools[1]', 'tool_not_approved'), ('allowed-tools[2]', 'tool_not_requested')]
