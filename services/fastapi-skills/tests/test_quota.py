"""A disabled Skill leaves the owner's list and stops counting against their quota (#507)."""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app, service
from app.models import SkillCreate, PublishRequest
from app.security import trusted_node, Principal
from test_service import MD, base  # noqa: F401 (base is a fixture)
from test_disable import SlowRegistry


async def make(svc, slug, owner='usr_A'):
    return await svc.create(owner, SkillCreate(slug=slug, display_name='Brand Tone', description='Applies the brand voice.'))


async def publish(svc, skill_id, owner='usr_A', key='key-12345678'):
    await svc.publish(owner, skill_id, PublishRequest(markdown=MD, tool_names=[]), key)
    op = next(o for o in svc.store.ops.values() if o['skillId'] == skill_id)
    await svc.publish_status(owner, skill_id, op['operationId'])


async def test_five_disabled_skills_free_their_slots(base):
    svc, store, _ = base
    for i in range(5):
        skill = await make(svc, f'skill-{i}a')
        await svc.disable('usr_A', skill['skillId'])
    assert store.quotas['usr_A']['skillCount'] == 0
    assert (await make(svc, 'skill-new'))['status'] == 'draft'


async def test_the_limit_still_holds_for_live_skills(base):
    svc, _, _ = base
    for i in range(5):
        await make(svc, f'live-{i}a')
    with pytest.raises(HTTPException) as failure:
        await make(svc, 'live-6a')
    assert failure.value.status_code == 422


async def test_disabled_skills_leave_the_list_unless_asked_for(base):
    svc, _, _ = base
    keep = await make(svc, 'keep-one')
    gone = await make(svc, 'gone-one')
    await svc.disable('usr_A', gone['skillId'])
    assert [s['skillId'] for s in svc.list_owned('usr_A')] == [keep['skillId']]
    assert {s['skillId'] for s in svc.list_owned('usr_A', include_disabled=True)} == {keep['skillId'], gone['skillId']}


async def test_a_pending_disable_hides_the_skill_but_frees_nothing_yet(base):
    svc, store, _ = base
    registry = SlowRegistry()
    svc.registry = registry
    skill = await make(svc, 'slow-one')
    first = await svc.disable('usr_A', skill['skillId'])
    assert svc.list_owned('usr_A') == []
    assert store.quotas['usr_A']['skillCount'] == 1
    registry.finish(first['operation'])
    await svc.read('usr_A', skill['skillId'])
    assert store.quotas['usr_A']['skillCount'] == 0


async def test_a_refused_disable_frees_nothing(base):
    svc, store, _ = base
    registry = SlowRegistry()
    svc.registry = registry
    skill = await make(svc, 'stay-one')
    first = await svc.disable('usr_A', skill['skillId'])
    registry.fail(first['operation'])
    await svc.read('usr_A', skill['skillId'])
    assert store.quotas['usr_A']['skillCount'] == 1
    assert [s['skillId'] for s in svc.list_owned('usr_A')] == [skill['skillId']]


async def test_published_bytes_are_freed_once(base):
    svc, store, _ = base
    skill = await make(svc, 'pub-one')
    await publish(svc, skill['skillId'])
    size = store.skills[skill['skillId']]['latestRawBytes']
    assert store.quotas['usr_A']['publishedBytes'] == size
    await svc.disable('usr_A', skill['skillId'])
    for _ in range(3):
        await svc.disable('usr_A', skill['skillId'])
        await svc.read('usr_A', skill['skillId'])
    assert store.quotas['usr_A'] == {'skillCount': 0, 'publishedBytes': 0, 'reservedDeltaBytes': 0}


async def test_re_creating_a_disabled_slug_is_refused_for_now(base):
    svc, _, _ = base
    skill = await make(svc, 'once-only')
    await svc.disable('usr_A', skill['skillId'])
    with pytest.raises(HTTPException) as failure:
        await make(svc, 'once-only')
    assert failure.value.status_code == 409


async def test_another_owners_quota_is_untouched(base):
    svc, store, _ = base
    await make(svc, 'theirs-one', owner='usr_B')
    mine = await make(svc, 'mine-one')
    await svc.disable('usr_A', mine['skillId'])
    assert store.quotas['usr_B']['skillCount'] == 1


def test_the_list_route_takes_include_disabled(base):
    svc, _, _ = base
    import asyncio
    gone = asyncio.run(make(svc, 'route-gone'))
    asyncio.run(svc.disable('usr_A', gone['skillId']))
    app.dependency_overrides[service] = lambda: svc
    app.dependency_overrides[trusted_node] = lambda: Principal(owner_key='usr_A', caller_email='unit-test-node')
    try:
        client = TestClient(app)
        assert client.get('/v1/skills').json()['skills'] == []
        assert [s['skillId'] for s in client.get('/v1/skills?include_disabled=true').json()['skills']] == [gone['skillId']]
    finally:
        app.dependency_overrides.clear()
