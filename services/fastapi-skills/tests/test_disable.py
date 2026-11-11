"""Disable and metadata updates follow their Registry operations to the end (#506)."""
import pytest
from fastapi import HTTPException
from app.models import SkillCreate, PublishRequest
from support import MD


async def make(svc, owner='usr_A', slug='brand-tone'):
    return await svc.create(owner, SkillCreate(slug=slug, display_name='Brand Tone', description='Applies the brand voice.'))


async def test_disable_records_its_operation_and_finishes_on_read(slow):
    svc, store, registry = slow
    skill = await make(svc)
    first = await svc.disable('usr_A', skill['skillId'])
    assert first['status'] == 'disable_requested'
    row = store.get_skill(skill['skillId'])
    assert row['disableOperation'] == first['operation']
    assert row['statusBeforeDisable'] == 'draft'
    assert (await svc.read('usr_A', skill['skillId']))['status'] == 'disable_requested'
    registry.finish(first['operation'])
    assert (await svc.read('usr_A', skill['skillId']))['status'] == 'disabled'
    assert store.get_skill(skill['skillId'])['disableOperation'] is None


async def test_a_second_disable_follows_the_first_operation(slow):
    svc, _, registry = slow
    skill = await make(svc)
    first = await svc.disable('usr_A', skill['skillId'])
    again = await svc.disable('usr_A', skill['skillId'])
    assert again == {'status': 'disable_requested', 'operation': first['operation']}
    assert len(registry.patch_calls) == 1
    registry.finish(first['operation'])
    assert (await svc.disable('usr_A', skill['skillId']))['status'] == 'disabled'
    assert (await svc.disable('usr_A', skill['skillId'])) == {'status': 'disabled', 'operation': None}
    assert len(registry.patch_calls) == 1


async def test_a_refused_disable_returns_the_skill_to_its_status_with_an_error(slow):
    svc, store, registry = slow
    skill = await make(svc)
    first = await svc.disable('usr_A', skill['skillId'])
    registry.fail(first['operation'])
    read = await svc.read('usr_A', skill['skillId'])
    assert read['status'] == 'draft'
    assert read['lastError'] == 'Agent Registry refused the disable'
    assert store.get_skill(skill['skillId'])['disableOperation'] is None


async def test_a_disable_that_is_done_at_once_finishes_at_once(base):
    svc, store, _ = base  # FakeRegistry answers done: True
    skill = await make(svc)
    assert (await svc.disable('usr_A', skill['skillId']))['status'] == 'disabled'
    assert store.get_skill(skill['skillId'])['status'] == 'disabled'


async def test_a_disable_during_a_publish_is_refused(slow):
    svc, store, _ = slow
    skill = await make(svc)
    store.patch_skill(skill['skillId'], {'activePublishOp': 'op-1'})
    with pytest.raises(HTTPException) as failure:
        await svc.disable('usr_A', skill['skillId'])
    assert failure.value.status_code == 409


async def test_a_disabled_skill_cannot_be_published(base):
    svc, _, _ = base
    skill = await make(svc)
    await svc.disable('usr_A', skill['skillId'])
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_A', skill['skillId'], PublishRequest(markdown=MD, tool_names=[]), 'key-12345678')
    assert failure.value.status_code == 409


async def test_disabling_keeps_published_revisions(base):
    svc, _, registry = base
    skill = await make(svc)
    await svc.publish('usr_A', skill['skillId'], PublishRequest(markdown=MD, tool_names=[]), 'key-12345678')
    await svc.publish_status('usr_A', skill['skillId'], next(iter(svc.store.ops)))
    revisions = dict(registry.revisions)
    await svc.disable('usr_A', skill['skillId'])
    assert registry.revisions == revisions


async def test_a_metadata_update_reports_updated_or_failed_when_its_operation_ends(slow):
    svc, store, registry = slow
    skill = await make(svc)
    pending = await svc.update_metadata('usr_A', skill['skillId'], {'displayName': 'New'})
    assert pending['status'] == 'pending'
    assert (await svc.read('usr_A', skill['skillId']))['metadataStatus'] == 'pending'
    registry.finish(pending['operation'])
    assert (await svc.read('usr_A', skill['skillId']))['metadataStatus'] == 'updated'
    second = await svc.update_metadata('usr_A', skill['skillId'], {'displayName': 'Newer'})
    registry.fail(second['operation'])
    read = await svc.read('usr_A', skill['skillId'])
    assert read['metadataStatus'] == 'failed'
    assert read['lastError'] == 'Agent Registry refused the metadata change'


async def test_reading_twice_is_safe(slow):
    svc, _, registry = slow
    skill = await make(svc)
    first = await svc.disable('usr_A', skill['skillId'])
    registry.finish(first['operation'])
    a = await svc.read('usr_A', skill['skillId'])
    b = await svc.read('usr_A', skill['skillId'])
    assert a['status'] == b['status'] == 'disabled'
    assert len(registry.patch_calls) == 1


async def test_another_owner_cannot_disable(slow):
    svc, _, _ = slow
    skill = await make(svc)
    with pytest.raises(HTTPException) as failure:
        await svc.disable('usr_B', skill['skillId'])
    assert failure.value.status_code == 404
