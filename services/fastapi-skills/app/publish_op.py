"""A publish operation, typed (#536). Stored rows keep their field names
(camelCase in skill_publish_requests): `from_row` / `to_row` convert, and a
row from an older build without the newer fields still reads. The stores keep
working on rows; the publish flow, the operator tool and the rules use this."""
from dataclasses import dataclass, field, fields, replace
from datetime import datetime


class State:
    """Where a publish stands. Plain strings: they are stored and returned as is."""
    PENDING = 'pending'
    PUBLISHING = 'publishing'
    PENDING_ACTIVATION = 'pending_activation'
    PUBLISHED = 'published'
    FAILED = 'failed'

    ALL = frozenset({PENDING, PUBLISHING, PENDING_ACTIVATION, PUBLISHED, FAILED})
    FINISHED = frozenset({PUBLISHED, FAILED})
    # Still creating the revision: the upload may not have reached the Registry.
    UPLOADING = frozenset({PENDING, PUBLISHING})


# Field → stored name. Everything else on a row is kept as is in `extra`.
_STORED = {
    'operation_id': 'operationId', 'owner_key': 'ownerKey', 'skill_id': 'skillId',
    'payload_hash': 'payloadHash', 'revision': 'revision', 'raw_bytes': 'rawBytes',
    'status': 'status', 'created_at': 'createdAt', 'updated_at': 'updatedAt',
    'reserved_delta_bytes': 'reservedDeltaBytes', 'registry_operation': 'registryOperation',
    'promotion_operation': 'promotionOperation', 'catalog_revision': 'catalogRevision',
    'error': 'error', 'expire_at': 'expireAt',
}

_ONLY_WHEN_SET = frozenset({'error', 'expire_at'})


@dataclass(frozen=True)
class PublishOp:
    operation_id: str
    owner_key: str
    skill_id: str
    payload_hash: str
    revision: str
    raw_bytes: int
    status: str
    created_at: str
    updated_at: str | None = None
    reserved_delta_bytes: int = 0
    registry_operation: str | None = None
    promotion_operation: str | None = None
    catalog_revision: str | None = None   # #510; absent on older rows
    error: str | None = None
    expire_at: datetime | None = None     # #508; absent on older rows
    extra: dict = field(default_factory=dict, compare=False)

    def __post_init__(self):
        if self.status not in State.ALL:
            raise ValueError(f'unknown publish state {self.status!r}')

    @classmethod
    def from_row(cls, row: dict) -> 'PublishOp':
        known = {name: row[stored] for name, stored in _STORED.items() if stored in row}
        extra = {k: v for k, v in row.items() if k not in _STORED.values()}
        return cls(**known, extra=extra)

    def to_row(self) -> dict:
        row = dict(self.extra)
        for f in fields(self):
            value = getattr(self, f.name)
            # Written only once set, as before: a running publish has no error or expiry.
            if f.name == 'extra' or (f.name in _ONLY_WHEN_SET and value is None):
                continue
            row[_STORED[f.name]] = value
        return row

    def with_(self, **changes) -> 'PublishOp':
        return replace(self, **changes)

    @property
    def finished(self) -> bool:
        return self.status in State.FINISHED

    @property
    def skill_resource(self) -> str:
        """The Registry Skill the revision belongs to."""
        return self.revision.split('/revisions/')[0]

    @property
    def revision_id(self) -> str:
        return self.revision.split('/')[-1]
