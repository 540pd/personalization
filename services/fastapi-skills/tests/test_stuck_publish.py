"""Stuck publish operations (#508): an upload deadline, reconciliation for one
that reached the Registry, an operator path with an audit record, and a TTL
field that nothing decides from."""
import pytest
from fastapi import HTTPException
from app import operator
from app.config import Settings
from app.models import SkillCreate, PublishRequest
from app.service import UPLOAD_TIMEOUT
from app.store import MemoryStore
from support import FakeRegistry, MD, make_parts
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data'
DEADLINE = 900


class Crash(Exception):
    """The process dies mid-publish."""


class CrashingRegistry(FakeRegistry):
    """Crashes the next create_revision, before (`before`) or after (`after`)
    the Registry stored the revision, so its operation name is never recorded."""
    def __init__(self):
        super().__init__()
        self.crash = None

    async def create_revision(self, parent, revision_id, archive, request_id):
        mode, self.crash = self.crash, None
        if mode == 'before':
            raise Crash()
        result = await super().create_revision(parent, revision_id, archive, request_id)
        if mode == 'after':
            raise Crash()
        return result


@pytest.fixture
def env(clock):
    store, registry = MemoryStore(), CrashingRegistry()
    cfg = Settings(google_cloud_project='test-project', registry_location='us', publish_upload_deadline_seconds=DEADLINE)
    svc = make_parts(cfg, store=store, registry=registry, clock=clock).service
    return svc, store, registry, clock


async def crashed_publish(svc, registry, mode, key='key-crashed-1'):
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    sid = created['skillId']
    registry.crash = mode
    with pytest.raises(Crash):
        await svc.publish('usr_A', sid, PublishRequest(markdown=MD, tool_names=['brand.read']), key)
    op_id = svc.store.get_skill(sid)['activePublishOp']
    assert op_id
    return sid, op_id


def reserved(store):
    return store._quota('usr_A')['reservedDeltaBytes']


@pytest.mark.asyncio
async def test_crash_before_upload_blocks_until_the_deadline_then_fails(env):
    svc, store, registry, clock = env
    sid, op_id = await crashed_publish(svc, registry, 'before')
    assert reserved(store) > 0
    # Inside the deadline a poll can't finish it, and another publish is blocked.
    assert (await svc.publish_status('usr_A', sid, op_id)).status == 'pending'
    with pytest.raises(HTTPException) as blocked:
        await svc.publish('usr_A', sid, PublishRequest(markdown=MD + '\nMore\n', tool_names=['brand.read']), 'key-other-01')
    assert blocked.value.status_code == 409
    clock.advance(DEADLINE + 1)
    status = await svc.publish_status('usr_A', sid, op_id)
    assert status.status == 'failed' and status.error == UPLOAD_TIMEOUT
    assert store.get_skill(sid)['activePublishOp'] is None
    assert reserved(store) == 0
    assert registry.revision_calls == 0


@pytest.mark.asyncio
async def test_a_new_publish_frees_a_skill_nobody_polls(env):
    svc, store, registry, clock = env
    sid, op_id = await crashed_publish(svc, registry, 'before')
    clock.advance(DEADLINE + 1)
    # No poll: the next publish of the Skill reads the stuck one first.
    result = await svc.publish('usr_A', sid, PublishRequest(markdown=MD + '\nMore\n', tool_names=['brand.read']), 'key-other-01')
    assert result.status in ('pending_activation', 'published')
    assert store.get_operation(op_id)['status'] == 'failed'
    assert reserved(store) >= 0


@pytest.mark.asyncio
async def test_resending_the_crashed_publish_after_the_deadline_does_not_upload(env):
    svc, store, registry, clock = env
    sid, op_id = await crashed_publish(svc, registry, 'before')
    clock.advance(DEADLINE + 1)
    again = await svc.publish('usr_A', sid, PublishRequest(markdown=MD, tool_names=['brand.read']), 'key-crashed-1')
    assert again.status == 'failed'
    assert registry.revision_calls == 0


@pytest.mark.asyncio
async def test_crash_after_upload_is_reconciled_not_failed(env):
    svc, store, registry, clock = env
    sid, op_id = await crashed_publish(svc, registry, 'after')
    assert registry.revision_calls == 1
    clock.advance(DEADLINE * 10)
    status = await svc.publish_status('usr_A', sid, op_id)
    assert status.status != 'failed'
    status = await svc.publish_status('usr_A', sid, op_id)
    assert status.status == 'published'
    assert reserved(store) == 0
    assert registry.revision_calls == 1


@pytest.mark.asyncio
async def test_recorded_registry_operation_is_never_failed_by_the_deadline(env):
    svc, store, registry, clock = env
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    sid = created['skillId']
    result = await svc.publish('usr_A', sid, PublishRequest(markdown=MD, tool_names=['brand.read']), 'key-12345678')
    # Pretend the revision is still being created, and its name was recorded.
    store.patch_operation(result.operation_id, {'status': 'publishing', 'registryOperation': 'ops/rev-running'})
    registry.revisions.clear()

    async def running(name):
        return {'name': name, 'done': False}
    registry.operation = running
    clock.advance(DEADLINE * 10)
    assert (await svc.publish_status('usr_A', sid, result.operation_id)).status == 'publishing'


@pytest.mark.asyncio
async def test_operator_fail_releases_and_is_audited(env):
    svc, store, registry, clock = env
    sid, op_id = await crashed_publish(svc, registry, 'before')
    result = await operator.fail(svc, op_id, 'ops@example.com', 'stuck in incident 12')
    assert result == {'outcome': 'changed', 'status': 'failed'}
    assert store.get_operation(op_id)['error'] == operator.OPERATOR_FAILED
    assert store.get_skill(sid)['activePublishOp'] is None
    assert reserved(store) == 0
    [row] = store.audit
    assert row['action'] == 'fail' and row['operator'] == 'ops@example.com'
    assert (row['statusBefore'], row['statusAfter'], row['outcome']) == ('pending', 'failed', 'changed')
    assert 'usr_A' not in str(row) and 'premium-tone' not in str(row)


@pytest.mark.asyncio
async def test_repeated_recovery_changes_nothing_twice(env):
    svc, store, registry, clock = env
    sid, op_id = await crashed_publish(svc, registry, 'before')
    await operator.fail(svc, op_id, 'ops@example.com', 'first')
    again = await operator.fail(svc, op_id, 'ops@example.com', 'second')
    assert again['outcome'] == 'no_change'
    assert reserved(store) == 0  # released once, not twice
    clock.advance(DEADLINE + 1)
    assert (await operator.reconcile(svc, op_id, 'ops@example.com', 'third'))['outcome'] == 'no_change'
    assert [r['outcome'] for r in store.audit] == ['changed', 'no_change', 'no_change']


@pytest.mark.asyncio
async def test_operator_fail_refuses_once_the_revision_reached_the_registry(env):
    svc, store, registry, clock = env
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    result = await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=MD, tool_names=['brand.read']), 'key-12345678')
    assert result.status == 'pending_activation'
    refused = await operator.fail(svc, result.operation_id, 'ops@example.com', 'try')
    assert refused['outcome'] == 'refused'
    assert store.get_operation(result.operation_id)['status'] == 'pending_activation'
    forced = await operator.fail(svc, result.operation_id, 'ops@example.com', 'forced', force=True)
    assert forced['outcome'] == 'changed'
    assert [r['outcome'] for r in store.audit] == ['refused', 'changed']
    assert store.audit[1]['force'] is True


@pytest.mark.asyncio
async def test_operator_reconcile_recovers_after_a_crash_after_upload(env):
    svc, store, registry, clock = env
    sid, op_id = await crashed_publish(svc, registry, 'after')
    await operator.reconcile(svc, op_id, 'ops@example.com', 'recover')
    final = await operator.reconcile(svc, op_id, 'ops@example.com', 'recover')
    assert final['status'] == 'published'
    assert store.audit[0]['statusBefore'] == 'pending'


def test_the_node_service_account_is_refused():
    with pytest.raises(SystemExit):
        operator.refuse_node_account('Node-Sa@proj.iam.gserviceaccount.com', 'node-sa@proj.iam.gserviceaccount.com')
    operator.refuse_node_account('ops@proj.iam.gserviceaccount.com', 'node-sa@proj.iam.gserviceaccount.com')
    operator.refuse_node_account(None, 'node-sa@proj.iam.gserviceaccount.com')


def test_no_http_route_reaches_the_operator_actions():
    from app.main import app
    paths = ' '.join(getattr(r, 'path', '') for r in app.routes)
    assert 'operator' not in paths and 'recover' not in paths and 'audit' not in paths


@pytest.mark.asyncio
async def test_finished_operations_get_an_expiry_that_is_never_read(env):
    svc, store, registry, clock = env
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    sid = created['skillId']
    result = await svc.publish('usr_A', sid, PublishRequest(markdown=MD, tool_names=['brand.read']), 'key-12345678')
    assert 'expireAt' not in store.get_operation(result.operation_id)
    assert (await svc.publish_status('usr_A', sid, result.operation_id)).status == 'published'
    op = store.get_operation(result.operation_id)
    assert op['expireAt'].year >= 2000
    # An expiry in the past changes nothing: the record still answers the same.
    from datetime import datetime, timezone
    op['expireAt'] = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert (await svc.publish_status('usr_A', sid, result.operation_id)).status == 'published'
    again = await svc.publish('usr_A', sid, PublishRequest(markdown=MD, tool_names=['brand.read']), 'key-12345678')
    assert again.status == 'published'
