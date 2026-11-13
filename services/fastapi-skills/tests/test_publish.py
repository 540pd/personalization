"""Publishing (publish.py, #530): idempotent, recoverable, within the budget.
Stuck publishes are in test_stuck_publish.py."""
import pytest
from fastapi import HTTPException
from app.models import SkillCreate, PublishRequest
from support import MD


@pytest.mark.asyncio
async def test_publish_idempotency_and_registry_only_content(base):
    svc, store, registry = base
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    assert created['status'] == 'draft'
    key = created['skillId']
    result = await svc.publish('usr_A', key, PublishRequest(markdown=MD, tool_names=['brand.read']), 'req-12345678')
    assert result.status == 'pending_activation'
    result = await svc.publish_status('usr_A', key, result.operation_id)
    assert result.status == 'published'
    again = await svc.publish('usr_A', key, PublishRequest(markdown=MD, tool_names=['brand.read']), 'req-12345678')
    assert again.status == 'published'
    assert registry.revision_calls == 1
    # Firestore ownership and op metadata must never contain SKILL.md text.
    assert 'premium-tone' not in str(store.skills)
    assert 'premium-tone' not in str(store.ops)


@pytest.mark.asyncio
async def test_publish_same_key_changed_body_conflicts(base):
    svc, *_ = base
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=MD), 'requestid22')
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=MD + '\nAnother rule\n'), 'requestid22')
    assert failure.value.status_code == 409


@pytest.mark.asyncio
async def test_combined_300_kib_budget(base):
    svc, store, registry = base
    large_md = MD + ('This is an approved instruction sentence. ' * 2400)
    assert len(large_md.encode('utf-8')) < 100 * 1024
    # Each of the first three is about 91 KiB; the fourth would cross 300 KiB.
    for i in range(3):
        created = await svc.create('usr_A', SkillCreate(slug=f'example-{i:02d}', display_name=f'Example {i}', description='Long enough skill description'))
        published = await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=large_md), f'large-{i}-request')
        await svc.publish_status('usr_A', created['skillId'], published.operation_id)
    created = await svc.create('usr_A', SkillCreate(slug='example-04', display_name='Example 4', description='Long enough skill description'))
    with pytest.raises(HTTPException) as error:
        await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=large_md), 'large-4-request')
    assert error.value.status_code == 422
