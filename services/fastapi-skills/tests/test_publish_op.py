"""Typed publish operations (#536): rows keep their stored names, older rows
still read, and the states are named in one place."""
import re
import typing
from datetime import datetime, timezone
from pathlib import Path
import pytest
from app.models import PublishRequest, PublishStatus, SkillCreate
from app.publish_op import PublishOp, State
from support import MD, make_parts

APP = Path(__file__).resolve().parent.parent / 'app'

# A row as builds before #508/#510 wrote it: no catalogRevision, no expireAt.
OLDER_ROW = {
    'operationId': 'op-1', 'ownerKey': 'usr_A', 'skillId': 'sk-1', 'payloadHash': 'p1',
    'revision': 'projects/p/locations/us/skills/s/revisions/r-1', 'rawBytes': 120, 'status': 'pending_activation',
    'registryOperation': None, 'promotionOperation': 'ops/promote-1',
    'createdAt': '2026-10-01T00:00:00+00:00', 'updatedAt': '2026-10-01T00:00:00+00:00', 'reservedDeltaBytes': 120,
}


def test_an_older_row_reads_and_round_trips_unchanged():
    op = PublishOp.from_row(OLDER_ROW)
    assert op.catalog_revision is None and op.expire_at is None and op.error is None
    assert op.promotion_operation == 'ops/promote-1'
    assert op.skill_resource == 'projects/p/locations/us/skills/s' and op.revision_id == 'r-1'
    row = op.to_row()
    assert row == {**OLDER_ROW, 'catalogRevision': None}  # unset error / expireAt stay off the row


def test_fields_it_doesnt_know_are_kept():
    op = PublishOp.from_row({**OLDER_ROW, 'futureField': 7})
    assert op.to_row()['futureField'] == 7


def test_a_finished_row_keeps_its_error_and_expiry():
    expire = datetime(2026, 12, 1, tzinfo=timezone.utc)
    op = PublishOp.from_row({**OLDER_ROW, 'status': 'failed', 'error': 'boom', 'expireAt': expire})
    assert op.finished and op.to_row()['error'] == 'boom' and op.to_row()['expireAt'] == expire


def test_an_unknown_state_is_refused():
    with pytest.raises(ValueError):
        PublishOp.from_row({**OLDER_ROW, 'status': 'done'})


def test_with_returns_a_changed_copy():
    op = PublishOp.from_row(OLDER_ROW)
    later = op.with_(status=State.PUBLISHED)
    assert (op.status, later.status) == (State.PENDING_ACTIVATION, State.PUBLISHED)


def test_the_states_match_the_api_model():
    assert set(typing.get_args(PublishStatus.model_fields['status'].annotation)) == State.ALL


def test_the_publish_flow_and_operator_name_no_state_by_hand():
    pattern = re.compile(r"'(pending|publishing|pending_activation|published|failed)'")
    for name in ('publish.py', 'operator.py'):
        assert pattern.findall((APP / name).read_text()) == [], name


async def test_a_stored_operation_has_the_names_it_always_had():
    parts = make_parts()
    svc = parts.service
    skill = await svc.create('usr_A', SkillCreate(slug='brand-tone', display_name='Brand Tone', description='Applies the brand voice.'))
    result = await svc.publish('usr_A', skill['skillId'], PublishRequest(markdown=MD), 'key-12345678')
    row = parts.store.get_operation(result.operation_id)
    assert set(row) == {
        'operationId', 'ownerKey', 'skillId', 'payloadHash', 'revision', 'rawBytes', 'status', 'createdAt', 'updatedAt',
        'reservedDeltaBytes', 'registryOperation', 'promotionOperation', 'catalogRevision',
    }
