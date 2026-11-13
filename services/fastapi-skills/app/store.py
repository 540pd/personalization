"""Ownership, quota and publish metadata; no published Skill bodies.

Both stores apply the same rules (app/rules.py, #528): each supplies a reader
and applies the writes a rule returns. FirestoreStore does both inside one
transaction; Registry calls never happen inside one."""
import copy
import hashlib
from datetime import datetime, timedelta, timezone
from . import rules
from .errors import ServiceError
from .rules import GONE, MAX_COMBINED_RAW_SKILL_BYTES, MAX_SKILLS_PER_OWNER, OPS, QUOTAS, SKILLS  # noqa: F401 (re-exported)

AUDIT = 'skill_publish_audit'


def stamp():
    return datetime.now(timezone.utc).isoformat()


def expire_at(days: int) -> datetime:
    """When a finished operation may be deleted (#508). Only a Firestore TTL
    policy reads it: no code decides anything from it."""
    return datetime.now(timezone.utc) + timedelta(days=days)


def key_for(owner: str, slug: str) -> str:
    return f'{hashlib.sha256(owner.encode()).hexdigest()[:12]}-{slug}'


def operation_key(owner: str, skill: str, key: str) -> str:
    return hashlib.sha256(f'{owner}:{skill}:{key}'.encode()).hexdigest()


class RuleStore:
    """The store operations, each one rule. Subclasses supply `_run`, which runs
    a rule against their data atomically, and the plain reads and patches."""
    retention_days = 30

    def _run(self, rule, *args):
        raise NotImplementedError

    def _decide(self, rule, *args):
        try:
            return self._run(rule, *args)
        except rules.Refused as refused:
            raise ServiceError(refused.status, refused.code, refused.message) from None

    def reserve_skill(self, row: dict):
        return self._decide(rules.reserve_skill, row)

    def finish_disable(self, skill_id: str) -> bool:
        return self._decide(rules.finish_disable, skill_id, stamp())

    def take_draft_slot(self, owner: str, now: float, limit: int, window: float) -> bool:
        return self._decide(rules.take_draft_slot, owner, now, limit, window)

    def reserve_operation(self, row: dict):
        return self._decide(rules.reserve_operation, row, stamp())

    def finish_operation(self, row: dict):
        return self._decide(rules.finish_operation, row, stamp(), expire_at(self.retention_days))

    def fail_operation(self, row: dict, error: str) -> bool:
        return self._decide(rules.fail_operation, row, error, stamp(), expire_at(self.retention_days))


class FirestoreStore(RuleStore):
    """Transactions span metadata only; Registry calls occur strictly outside transactions."""
    def __init__(self, project_id: str, retention_days: int = 30, db=None):
        if db is None:
            from google.cloud import firestore
            db = firestore.Client(project=project_id)
        self.db = db
        self.retention_days = retention_days

    def _in_transaction(self, work):
        """Runs `work(tx)` in a Firestore transaction, retried on contention."""
        from google.cloud import firestore
        return firestore.transactional(work)(self.db.transaction())

    def _run(self, rule, *args):
        def work(tx):
            def read(collection, doc_id):
                snap = self.db.collection(collection).document(doc_id).get(transaction=tx)
                return snap.to_dict() if snap.exists else None
            decision = rule(read, *args)  # every read happens before any write, as Firestore requires
            for w in decision.writes:
                ref = self.db.collection(w.collection).document(w.doc_id)
                {'create': tx.create, 'set': tx.set, 'update': tx.update}[w.kind](ref, w.fields)
            return decision.result
        return self._in_transaction(work)

    def _get(self, collection: str, doc_id: str) -> dict | None:
        snap = self.db.collection(collection).document(doc_id).get()
        return snap.to_dict() if snap.exists else None

    def get_skill(self, skill_id: str) -> dict | None:
        return self._get(SKILLS, skill_id)

    def list_skills(self, owner: str, include_disabled: bool = False) -> list[dict]:
        rows = [doc.to_dict() for doc in self.db.collection(SKILLS).where('ownerKey', '==', owner).stream()]
        return rows if include_disabled else [r for r in rows if r.get('status') not in GONE]

    def patch_skill(self, skill_id: str, fields: dict):
        self.db.collection(SKILLS).document(skill_id).update({**fields, 'updatedAt': stamp()})

    def get_operation(self, op_id: str) -> dict | None:
        return self._get(OPS, op_id)

    def patch_operation(self, op_id: str, fields: dict):
        self.db.collection(OPS).document(op_id).update({**fields, 'updatedAt': stamp()})

    def record_audit(self, row: dict):
        """An operator action on a publish operation (#508)."""
        self.db.collection(AUDIT).add(row)


class MemoryStore(RuleStore):
    """Test double: dicts, one process, no persistence. Same rules as Firestore."""
    def __init__(self, retention_days: int = 30):
        self.skills = {}
        self.ops = {}
        self.quotas = {}
        self.audit = []
        self.retention_days = retention_days
        self._collections = {SKILLS: self.skills, OPS: self.ops, QUOTAS: self.quotas}

    @property
    def drafts(self) -> dict:
        """The draft window per owner, as the helper tests read it."""
        return {owner: {'start': q['draftWindowStart'], 'count': q['draftCount']}
                for owner, q in self.quotas.items() if 'draftCount' in q}

    def _quota(self, owner):
        return rules.quota_of(lambda c, i: self._collections[c].get(i), owner)

    def _run(self, rule, *args):
        decision = rule(lambda c, i: copy.deepcopy(self._collections[c].get(i)), *args)
        for w in decision.writes:
            docs = self._collections[w.collection]
            if w.kind == 'create':
                if w.doc_id in docs:
                    raise RuntimeError(f'{w.collection}/{w.doc_id} already exists')
                docs[w.doc_id] = copy.deepcopy(w.fields)
            elif w.kind == 'set':
                docs[w.doc_id] = copy.deepcopy(w.fields)
            else:
                docs[w.doc_id].update(copy.deepcopy(w.fields))  # KeyError if missing, like Firestore
        return copy.deepcopy(decision.result)

    def get_skill(self, skill_id):
        return self.skills.get(skill_id)

    def list_skills(self, owner, include_disabled=False):
        return [r for r in self.skills.values() if r['ownerKey'] == owner and (include_disabled or r.get('status') not in GONE)]

    def patch_skill(self, skill_id, fields):
        self.skills[skill_id].update(fields)

    def get_operation(self, op_id):
        return self.ops.get(op_id)

    def patch_operation(self, op_id, fields):
        self.ops[op_id].update(fields)

    def record_audit(self, row: dict):
        self.audit.append(dict(row))
