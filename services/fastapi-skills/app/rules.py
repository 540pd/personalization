"""The Skill, quota and publish-lock rules (#528), written once.

Each rule reads the rows it needs through `read(collection, doc_id)` and
returns a Decision: its result and the writes to make. A rule does no I/O of
its own and imports nothing from FastAPI, so the in-memory store the tests use
and the Firestore store production uses apply the very same rules; each store
only supplies `read` and applies the writes (Firestore: in one transaction).
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Literal
from . import codes
from .publish_op import State

SKILLS = 'skill_ownership'
OPS = 'skill_publish_requests'
QUOTAS = 'skill_quotas'

MAX_SKILLS_PER_OWNER = 5
MAX_COMBINED_RAW_SKILL_BYTES = 300 * 1024
# A Skill in these states is gone for its owner (#507): not listed, not counted.
GONE = ('disable_requested', 'disabled')

Reader = Callable[[str, str], dict | None]


@dataclass(frozen=True)
class Write:
    """`create` fails if the doc exists; `set` replaces it; `update` merges into an existing doc."""
    kind: Literal['create', 'set', 'update']
    collection: str
    doc_id: str
    fields: dict


@dataclass
class Decision:
    result: Any = None
    writes: list[Write] = field(default_factory=list)


class Refused(Exception):
    """A rule said no: the status and code (app/codes.py) the service answers with."""
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def quota_of(read: Reader, owner: str) -> dict:
    """The owner's quota row, with its counters defaulted. Other fields on the
    row (the draft window) are kept, so writing it back never drops them."""
    return {'skillCount': 0, 'publishedBytes': 0, 'reservedDeltaBytes': 0, **(read(QUOTAS, owner) or {})}


def reserve_skill(read: Reader, row: dict) -> Decision:
    existing = read(SKILLS, row['skillId'])
    if existing:
        if existing['ownerKey'] != row['ownerKey']:
            raise Refused(404, codes.NOT_ACCESSIBLE, 'Skill unavailable')
        if existing.get('status') in GONE:
            raise Refused(409, codes.CONFLICT, 'This Skill was disabled; re-creating it is not supported yet')
        if existing['createHash'] != row['createHash']:
            raise Refused(409, codes.CONFLICT, 'Skill ID reserved with different metadata')
        return Decision(existing)
    quota = quota_of(read, row['ownerKey'])
    if quota['skillCount'] >= MAX_SKILLS_PER_OWNER:
        raise Refused(422, codes.QUOTA, 'Maximum five Skills per user')
    return Decision(row, [
        Write('create', SKILLS, row['skillId'], row),
        Write('set', QUOTAS, row['ownerKey'], {**quota, 'skillCount': quota['skillCount'] + 1}),
    ])


def finish_disable(read: Reader, skill_id: str, now: str) -> Decision:
    """Disabled once, freeing its slot and published bytes in the same step (#506, #507)."""
    skill = read(SKILLS, skill_id)
    if not skill or skill.get('status') == 'disabled':
        return Decision(False)
    quota = quota_of(read, skill['ownerKey'])
    return Decision(True, [
        Write('update', SKILLS, skill_id, {'status': 'disabled', 'disableOperation': None, 'quotaReleased': True, 'updatedAt': now}),
        Write('set', QUOTAS, skill['ownerKey'], {
            **quota,
            'skillCount': max(0, quota['skillCount'] - 1),
            'publishedBytes': max(0, quota['publishedBytes'] - skill.get('latestRawBytes', 0)),
        }),
    ])


def take_draft_slot(read: Reader, owner: str, now: float, limit: int, window: float) -> Decision:
    """One AI-helper call (#511), if under `limit` in the current fixed `window` (seconds)."""
    quota = read(QUOTAS, owner) or {}
    start, count = quota.get('draftWindowStart', 0), quota.get('draftCount', 0)
    if now - start >= window:
        start, count = now, 0
    if count >= limit:
        return Decision(False)
    return Decision(True, [Write('set', QUOTAS, owner, {**quota, 'draftWindowStart': start, 'draftCount': count + 1})])


def reserve_operation(read: Reader, row: dict, now: str) -> Decision:
    """Reserve a publish: the same key returns its operation; another publish
    holding the Skill's lock, or a budget overrun, is refused."""
    skill = read(SKILLS, row['skillId'])
    if not skill or skill.get('ownerKey') != row['ownerKey']:
        raise Refused(404, codes.NOT_ACCESSIBLE, 'Skill not found')
    existing = read(OPS, row['operationId'])
    if existing:
        if existing['payloadHash'] != row['payloadHash']:
            raise Refused(409, codes.IDEMPOTENCY, 'Idempotency key reused with changed content')
        return Decision(existing)
    if skill.get('activePublishOp'):
        raise Refused(409, codes.PUBLISH_IN_PROGRESS, 'Another publish is already in progress')
    quota = quota_of(read, row['ownerKey'])
    delta = max(0, row['rawBytes'] - skill.get('latestRawBytes', 0))
    if quota['publishedBytes'] + quota['reservedDeltaBytes'] + delta > MAX_COMBINED_RAW_SKILL_BYTES:
        raise Refused(422, codes.QUOTA, '300 KiB combined user Skills limit exceeded')
    record = {**row, 'reservedDeltaBytes': delta}
    return Decision(record, [
        Write('create', OPS, row['operationId'], record),
        Write('update', SKILLS, row['skillId'], {'activePublishOp': row['operationId'], 'updatedAt': now}),
        Write('set', QUOTAS, row['ownerKey'], {**quota, 'reservedDeltaBytes': quota['reservedDeltaBytes'] + delta}),
    ])


def finish_operation(read: Reader, row: dict, now: str, expire: datetime) -> Decision:
    """Published: counts its bytes once, only for the lock holder."""
    op, skill = read(OPS, row['operationId']), read(SKILLS, row['skillId'])
    if not op or not skill:
        raise Refused(409, codes.CONFLICT, 'Publish reservation missing')
    if skill.get('ownerKey') != row['ownerKey'] or op.get('ownerKey') != row['ownerKey']:
        raise Refused(409, codes.CONFLICT, 'Publish ownership mismatch')
    if op.get('status') == State.PUBLISHED:
        return Decision()  # a retried completion must not count the bytes twice
    if skill.get('activePublishOp') != row['operationId']:
        raise Refused(409, codes.CONFLICT, 'Publish fencing mismatch')
    quota = quota_of(read, row['ownerKey'])
    return Decision(None, [
        Write('update', OPS, row['operationId'], {'status': State.PUBLISHED, 'updatedAt': now, 'expireAt': expire}),
        Write('update', SKILLS, row['skillId'], {
            'latestPublishedRevision': op['revision'], 'latestRawBytes': op['rawBytes'],
            'activePublishOp': None, 'status': 'published', 'updatedAt': now,
        }),
        Write('set', QUOTAS, row['ownerKey'], {
            **quota,
            'publishedBytes': quota['publishedBytes'] + op['rawBytes'] - skill.get('latestRawBytes', 0),
            'reservedDeltaBytes': max(0, quota['reservedDeltaBytes'] - op['reservedDeltaBytes']),
        }),
    ])


def fail_operation(read: Reader, row: dict, error: str, now: str, expire: datetime) -> Decision:
    """Failed: releases the lock (if it holds it) and its reserved bytes, once.
    The result says whether anything changed."""
    op = read(OPS, row['operationId'])
    if not op or op.get('status') in State.FINISHED:
        return Decision(False)
    skill = read(SKILLS, row['skillId'])
    quota = quota_of(read, row['ownerKey'])
    writes = []
    if skill and skill.get('activePublishOp') == row['operationId']:
        writes.append(Write('update', SKILLS, row['skillId'], {'activePublishOp': None, 'updatedAt': now}))
    writes += [
        Write('update', OPS, row['operationId'], {'status': State.FAILED, 'error': error, 'updatedAt': now, 'expireAt': expire}),
        Write('set', QUOTAS, row['ownerKey'], {**quota, 'reservedDeltaBytes': max(0, quota['reservedDeltaBytes'] - op.get('reservedDeltaBytes', 0))}),
    ]
    return Decision(True, writes)
