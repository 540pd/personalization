"""One rulebook for both stores (#528). The rules are tested directly, and the
same store cases run against MemoryStore and against FirestoreStore over a
Firestore-shaped fake, so its transaction wiring is tested without Firestore."""
import copy
import pytest
from fastapi import HTTPException
from app import rules
from app.rules import OPS, QUOTAS, SKILLS, Refused, Write
from app.store import FirestoreStore, MemoryStore


# ── A Firestore-shaped fake: documents in dicts, writes applied at commit ──

class Snap:
    def __init__(self, data):
        self.exists = data is not None
        self._data = data

    def to_dict(self):
        return copy.deepcopy(self._data)


class Ref:
    def __init__(self, db, collection, doc_id):
        self.db, self.collection, self.id = db, collection, doc_id

    def get(self, transaction=None):
        return Snap(self.db.docs.setdefault(self.collection, {}).get(self.id))

    def update(self, fields):
        self.db.docs[self.collection][self.id].update(copy.deepcopy(fields))


class Query:
    def __init__(self, rows):
        self.rows = rows

    def stream(self):
        return [Snap(r) for r in self.rows]


class Collection:
    def __init__(self, db, name):
        self.db, self.name = db, name

    def document(self, doc_id):
        return Ref(self.db, self.name, doc_id)

    def where(self, field, op, value):
        assert op == '=='
        return Query([r for r in self.db.docs.get(self.name, {}).values() if r.get(field) == value])

    def add(self, row):
        self.db.docs.setdefault(self.name, {})[f'auto-{len(self.db.docs.get(self.name, {}))}'] = copy.deepcopy(row)


class Transaction:
    def __init__(self, db):
        self.db, self.pending = db, []

    def create(self, ref, fields):
        self.pending.append(('create', ref, fields))

    def set(self, ref, fields):
        self.pending.append(('set', ref, fields))

    def update(self, ref, fields):
        self.pending.append(('update', ref, fields))

    def commit(self):
        for kind, ref, fields in self.pending:
            docs = self.db.docs.setdefault(ref.collection, {})
            if kind == 'create' and ref.id in docs:
                raise RuntimeError('already exists')
            if kind == 'update' and ref.id not in docs:
                raise RuntimeError('no document to update')
            docs[ref.id] = {**docs.get(ref.id, {}), **copy.deepcopy(fields)} if kind == 'update' else copy.deepcopy(fields)


class FakeFirestore:
    def __init__(self):
        self.docs = {}

    def collection(self, name):
        return Collection(self, name)


class FakeFirestoreStore(FirestoreStore):
    def __init__(self):
        super().__init__('test-project', db=FakeFirestore())

    def _in_transaction(self, work):
        tx = Transaction(self.db)
        result = work(tx)  # a refusal raises here, and nothing is committed
        tx.commit()
        return result

    def quota(self, owner):
        return self.db.docs.get(QUOTAS, {}).get(owner, {})


class Memory(MemoryStore):
    def quota(self, owner):
        return self.quotas.get(owner, {})


@pytest.fixture(params=['memory', 'firestore'])
def store(request):
    return Memory() if request.param == 'memory' else FakeFirestoreStore()


def skill_row(i=0, owner='usr_A', create_hash='h'):
    return {'skillId': f'sk-{i}', 'ownerKey': owner, 'status': 'draft', 'createHash': create_hash}


def op_row(op='op-1', skill='sk-0', owner='usr_A', payload='p1', raw=100):
    return {'operationId': op, 'skillId': skill, 'ownerKey': owner, 'payloadHash': payload,
            'revision': f'{skill}/revisions/{payload}', 'rawBytes': raw, 'status': 'pending'}


def refused(call, *args):
    with pytest.raises(HTTPException) as failure:
        call(*args)
    return failure.value.status_code, failure.value.detail


# ── The same cases on both stores ──

def test_reserve_skill_is_idempotent_and_counts_once(store):
    store.reserve_skill(skill_row())
    assert store.reserve_skill(skill_row())['skillId'] == 'sk-0'
    assert store.quota('usr_A')['skillCount'] == 1


def test_reserve_skill_refusals_have_one_message(store):
    store.reserve_skill(skill_row())
    assert refused(store.reserve_skill, skill_row(create_hash='other')) == (409, 'Skill ID reserved with different metadata')
    assert refused(store.reserve_skill, skill_row(owner='usr_B')) == (404, 'Skill unavailable')
    for i in range(1, 5):
        store.reserve_skill(skill_row(i))
    assert refused(store.reserve_skill, skill_row(5)) == (422, 'Maximum five Skills per user')


def test_publish_reservation_rules(store):
    store.reserve_skill(skill_row())
    store.reserve_operation(op_row())
    assert store.reserve_operation(op_row())['operationId'] == 'op-1'  # same key, same payload
    assert refused(store.reserve_operation, op_row(payload='p2')) == (409, 'Idempotency key reused with changed content')
    assert refused(store.reserve_operation, op_row(op='op-2', payload='p2')) == (409, 'Another publish is already in progress')
    assert store.quota('usr_A')['reservedDeltaBytes'] == 100


def test_reserve_operation_checks_the_owner(store):
    store.reserve_skill(skill_row())
    assert refused(store.reserve_operation, op_row(owner='usr_B')) == (404, 'Skill not found')
    assert store.get_skill('sk-0').get('activePublishOp') is None


def test_a_refused_reservation_writes_nothing(store):
    store.reserve_skill(skill_row())
    assert refused(store.reserve_operation, op_row(raw=rules.MAX_COMBINED_RAW_SKILL_BYTES + 1))[0] == 422
    assert store.get_operation('op-1') is None
    assert store.get_skill('sk-0').get('activePublishOp') is None
    assert store.quota('usr_A')['reservedDeltaBytes'] == 0


def test_finish_counts_once_and_only_for_the_lock_holder(store):
    store.reserve_skill(skill_row())
    row = store.reserve_operation(op_row())
    store.finish_operation(row)
    store.finish_operation(row)  # retried
    assert store.quota('usr_A')['publishedBytes'] == 100
    assert store.quota('usr_A')['reservedDeltaBytes'] == 0
    assert store.get_skill('sk-0')['activePublishOp'] is None
    assert store.get_operation('op-1')['expireAt']
    # A second publish whose lock was taken away can't finish.
    second = store.reserve_operation(op_row(op='op-2', payload='p2', raw=150))
    store.patch_skill('sk-0', {'activePublishOp': 'someone-else'})
    assert refused(store.finish_operation, second) == (409, 'Publish fencing mismatch')
    assert refused(store.finish_operation, {**second, 'ownerKey': 'usr_B'}) == (409, 'Publish ownership mismatch')


def test_fail_releases_once_and_never_after_publish(store):
    store.reserve_skill(skill_row())
    row = store.reserve_operation(op_row())
    assert store.fail_operation(row, 'boom') is True
    assert store.fail_operation(row, 'boom') is False
    assert store.quota('usr_A')['reservedDeltaBytes'] == 0
    assert store.get_skill('sk-0')['activePublishOp'] is None
    done = store.reserve_operation(op_row(op='op-2', payload='p2'))
    store.finish_operation(done)
    assert store.fail_operation(done, 'late') is False
    assert store.get_operation('op-2')['status'] == 'published'


def test_finish_disable_frees_the_slot_once(store):
    store.reserve_skill(skill_row())
    store.finish_operation(store.reserve_operation(op_row()))
    assert store.finish_disable('sk-0') is True
    assert store.finish_disable('sk-0') is False
    assert store.quota('usr_A')['skillCount'] == 0
    assert store.quota('usr_A')['publishedBytes'] == 0
    assert store.list_skills('usr_A') == []
    assert len(store.list_skills('usr_A', include_disabled=True)) == 1


def test_draft_window_survives_other_quota_writes(store):
    # Before #528, Firestore's quota writes replaced the row and reset the draft count.
    assert store.take_draft_slot('usr_A', 1000.0, 2, 3600) is True
    store.reserve_skill(skill_row())
    store.finish_operation(store.reserve_operation(op_row()))
    assert store.take_draft_slot('usr_A', 1001.0, 2, 3600) is True
    assert store.take_draft_slot('usr_A', 1002.0, 2, 3600) is False
    assert store.take_draft_slot('usr_A', 4600.0, 2, 3600) is True  # a new window


# ── The rules themselves ──

def reader(docs):
    return lambda c, i: copy.deepcopy(docs.get(c, {}).get(i))


def test_rules_return_writes_and_do_no_io():
    decision = rules.reserve_skill(reader({}), skill_row())
    assert decision.writes == [
        Write('create', SKILLS, 'sk-0', skill_row()),
        Write('set', QUOTAS, 'usr_A', {'skillCount': 1, 'publishedBytes': 0, 'reservedDeltaBytes': 0}),
    ]
    docs = {SKILLS: {'sk-0': {**skill_row(), 'activePublishOp': 'op-1'}}, OPS: {'op-1': {**op_row(), 'status': 'failed'}}}
    assert rules.fail_operation(reader(docs), op_row(), 'x', 'now', None).writes == []


def test_rules_refuse_without_http():
    with pytest.raises(Refused) as failure:
        rules.reserve_operation(reader({}), op_row(), 'now')
    assert (failure.value.status, failure.value.message) == (404, 'Skill not found')


def test_rules_import_nothing_from_fastapi():
    from pathlib import Path
    lines = Path(rules.__file__).read_text().splitlines()
    assert not [line for line in lines if line.startswith(('import fastapi', 'from fastapi'))]
