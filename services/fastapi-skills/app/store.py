"""Minimal transactional ownership/quota/idempotency metadata; no published Skill bodies."""
import hashlib
from datetime import datetime, timezone
from fastapi import HTTPException

MAX_SKILLS_PER_OWNER = 5
MAX_COMBINED_RAW_SKILL_BYTES = 300 * 1024


def stamp():
    return datetime.now(timezone.utc).isoformat()


def key_for(owner: str, slug: str) -> str:
    return f'{hashlib.sha256(owner.encode()).hexdigest()[:12]}-{slug}'


def operation_key(owner: str, skill: str, key: str) -> str:
    return hashlib.sha256(f'{owner}:{skill}:{key}'.encode()).hexdigest()


class FirestoreStore:
    """Transactions span metadata only; Registry calls occur strictly outside transactions."""
    def __init__(self, project_id: str):
        from google.cloud import firestore
        self.db = firestore.Client(project=project_id)

    def _quota_ref(self, owner: str):
        return self.db.collection('skill_quotas').document(owner)

    def get_skill(self, skill_id: str) -> dict | None:
        snap = self.db.collection('skill_ownership').document(skill_id).get()
        return snap.to_dict() if snap.exists else None

    def list_skills(self, owner: str) -> list[dict]:
        return [doc.to_dict() for doc in self.db.collection('skill_ownership').where('ownerKey', '==', owner).stream()]

    def reserve_skill(self, row: dict):
        from google.cloud import firestore
        ref = self.db.collection('skill_ownership').document(row['skillId'])
        quota_ref = self._quota_ref(row['ownerKey'])
        txn = self.db.transaction()

        @firestore.transactional
        def work(tx):
            existing = ref.get(transaction=tx)
            quota_doc = quota_ref.get(transaction=tx)
            if existing.exists:
                previous = existing.to_dict()
                if previous['ownerKey'] != row['ownerKey']:
                    raise HTTPException(404, detail='Skill unavailable')
                if previous['createHash'] != row['createHash']:
                    raise HTTPException(409, detail='Skill ID reserved with different metadata')
                return previous
            quota = quota_doc.to_dict() if quota_doc.exists else {}
            count = quota.get('skillCount', 0)
            if count >= MAX_SKILLS_PER_OWNER:
                raise HTTPException(422, detail='Maximum five Skills per user')
            tx.create(ref, row)
            tx.set(quota_ref, {
                'skillCount': count + 1,
                'publishedBytes': quota.get('publishedBytes', 0),
                'reservedDeltaBytes': quota.get('reservedDeltaBytes', 0),
            })
            return row
        return work(txn)

    def patch_skill(self, skill_id: str, fields: dict):
        self.db.collection('skill_ownership').document(skill_id).update({**fields, 'updatedAt': stamp()})

    def finish_disable(self, skill_id: str) -> bool:
        """Marks a Skill disabled once its Registry disable is done (#506); once only."""
        from google.cloud import firestore
        ref = self.db.collection('skill_ownership').document(skill_id)
        txn = self.db.transaction()

        @firestore.transactional
        def work(tx):
            snap = ref.get(transaction=tx)
            if not snap.exists or snap.to_dict().get('status') == 'disabled':
                return False
            tx.update(ref, {'status': 'disabled', 'disableOperation': None, 'updatedAt': stamp()})
            return True
        return work(txn)

    def get_operation(self, op_id: str) -> dict | None:
        snap = self.db.collection('skill_publish_requests').document(op_id).get()
        return snap.to_dict() if snap.exists else None

    def reserve_operation(self, row: dict):
        from google.cloud import firestore
        op_ref = self.db.collection('skill_publish_requests').document(row['operationId'])
        skill_ref = self.db.collection('skill_ownership').document(row['skillId'])
        quota_ref = self._quota_ref(row['ownerKey'])
        txn = self.db.transaction()

        @firestore.transactional
        def work(tx):
            skill_doc = skill_ref.get(transaction=tx)
            op_doc = op_ref.get(transaction=tx)
            quota_doc = quota_ref.get(transaction=tx)
            if not skill_doc.exists or skill_doc.to_dict().get('ownerKey') != row['ownerKey']:
                raise HTTPException(404, detail='Skill not found')
            if op_doc.exists:
                old = op_doc.to_dict()
                if old['payloadHash'] != row['payloadHash']:
                    raise HTTPException(409, detail='Idempotency key reused with changed content')
                return old
            skill = skill_doc.to_dict()
            if skill.get('activePublishOp'):
                raise HTTPException(409, detail='Another publish is already in progress')
            quota = quota_doc.to_dict() if quota_doc.exists else {}
            old_size = skill.get('latestRawBytes', 0)
            delta_reserved = max(0, row['rawBytes'] - old_size)
            if (quota.get('publishedBytes', 0) + quota.get('reservedDeltaBytes', 0) + delta_reserved
                    > MAX_COMBINED_RAW_SKILL_BYTES):
                raise HTTPException(422, detail='300 KiB combined user Skills limit exceeded')
            record = {**row, 'reservedDeltaBytes': delta_reserved}
            tx.create(op_ref, record)
            tx.update(skill_ref, {'activePublishOp': row['operationId'], 'updatedAt': stamp()})
            tx.set(quota_ref, {
                'skillCount': quota.get('skillCount', 0),
                'publishedBytes': quota.get('publishedBytes', 0),
                'reservedDeltaBytes': quota.get('reservedDeltaBytes', 0) + delta_reserved,
            })
            return record
        return work(txn)

    def patch_operation(self, op_id: str, fields: dict):
        self.db.collection('skill_publish_requests').document(op_id).update({**fields, 'updatedAt': stamp()})

    def finish_operation(self, row: dict):
        from google.cloud import firestore
        op_ref = self.db.collection('skill_publish_requests').document(row['operationId'])
        skill_ref = self.db.collection('skill_ownership').document(row['skillId'])
        quota_ref = self._quota_ref(row['ownerKey'])
        txn = self.db.transaction()

        @firestore.transactional
        def work(tx):
            op_doc = op_ref.get(transaction=tx)
            skill_doc = skill_ref.get(transaction=tx)
            quota_doc = quota_ref.get(transaction=tx)
            if not op_doc.exists or not skill_doc.exists:
                raise HTTPException(409, detail='Publish reservation missing')
            op = op_doc.to_dict()
            skill = skill_doc.to_dict()
            if skill.get('ownerKey') != row['ownerKey'] or op.get('ownerKey') != row['ownerKey']:
                raise HTTPException(409, detail='Publish ownership mismatch')
            if op.get('status') == 'published':
                return  # Retried completion must not double-count size.
            if skill.get('activePublishOp') != row['operationId']:
                raise HTTPException(409, detail='Publish fencing mismatch')
            quota = quota_doc.to_dict() if quota_doc.exists else {}
            updated_total = quota.get('publishedBytes', 0) + op['rawBytes'] - skill.get('latestRawBytes', 0)
            tx.update(op_ref, {'status': 'published', 'updatedAt': stamp()})
            tx.update(skill_ref, {
                'latestPublishedRevision': op['revision'],
                'latestRawBytes': op['rawBytes'], 'activePublishOp': None,
                'status': 'published', 'updatedAt': stamp(),
            })
            tx.set(quota_ref, {
                'skillCount': quota.get('skillCount', 0),
                'publishedBytes': updated_total,
                'reservedDeltaBytes': max(0, quota.get('reservedDeltaBytes', 0) - op['reservedDeltaBytes']),
            })
        work(txn)

    def fail_operation(self, row: dict, error: str):
        from google.cloud import firestore
        op_ref = self.db.collection('skill_publish_requests').document(row['operationId'])
        skill_ref = self.db.collection('skill_ownership').document(row['skillId'])
        quota_ref = self._quota_ref(row['ownerKey'])
        txn = self.db.transaction()

        @firestore.transactional
        def work(tx):
            skill_doc = skill_ref.get(transaction=tx)
            op_doc = op_ref.get(transaction=tx)
            quota_doc = quota_ref.get(transaction=tx)
            if not op_doc.exists:
                return
            op = op_doc.to_dict()
            if op.get('status') in ('failed', 'published'):
                return
            quota = quota_doc.to_dict() if quota_doc.exists else {}
            if skill_doc.exists and skill_doc.to_dict().get('activePublishOp') == row['operationId']:
                tx.update(skill_ref, {'activePublishOp': None})
            tx.update(op_ref, {'status': 'failed', 'error': error, 'updatedAt': stamp()})
            tx.set(quota_ref, {
                'skillCount': quota.get('skillCount', 0),
                'publishedBytes': quota.get('publishedBytes', 0),
                'reservedDeltaBytes': max(0, quota.get('reservedDeltaBytes', 0) - op.get('reservedDeltaBytes', 0)),
            })
        work(txn)


class MemoryStore:
    """Test double only - no persistence or multi-instance isolation."""
    def __init__(self):
        self.skills = {}
        self.ops = {}
        self.quotas = {}

    def _quota(self, owner):
        return self.quotas.setdefault(owner, {'skillCount': 0, 'publishedBytes': 0, 'reservedDeltaBytes': 0})

    def get_skill(self, skill_id):
        return self.skills.get(skill_id)

    def list_skills(self, owner):
        return [r for r in self.skills.values() if r['ownerKey'] == owner]

    def reserve_skill(self, row):
        old = self.skills.get(row['skillId'])
        if old:
            if old['ownerKey'] != row['ownerKey']:
                raise HTTPException(404, 'Skill unavailable')
            if old['createHash'] != row['createHash']:
                raise HTTPException(409, 'Skill ID already reserved with different metadata')
            return old.copy()
        quota = self._quota(row['ownerKey'])
        if quota['skillCount'] >= MAX_SKILLS_PER_OWNER:
            raise HTTPException(422, 'Maximum five Skills per user')
        quota['skillCount'] += 1
        self.skills[row['skillId']] = row.copy()
        return row.copy()

    def patch_skill(self, skill_id, fields):
        self.skills[skill_id].update(fields)

    def finish_disable(self, skill_id):
        skill = self.skills.get(skill_id)
        if not skill or skill.get('status') == 'disabled':
            return False
        skill.update(status='disabled', disableOperation=None)
        return True

    def get_operation(self, op_id):
        return self.ops.get(op_id)

    def reserve_operation(self, row):
        op_id = row['operationId']
        if op_id in self.ops:
            if self.ops[op_id]['payloadHash'] != row['payloadHash']:
                raise HTTPException(409, 'Idempotency mismatch')
            return self.ops[op_id].copy()
        skill = self.skills[row['skillId']]
        if skill.get('activePublishOp'):
            raise HTTPException(409, 'Publish already active')
        quota = self._quota(row['ownerKey'])
        delta = max(0, row['rawBytes'] - skill.get('latestRawBytes', 0))
        if quota['publishedBytes'] + quota['reservedDeltaBytes'] + delta > MAX_COMBINED_RAW_SKILL_BYTES:
            raise HTTPException(422, 'Combined Skills budget exceeded')
        record = {**row, 'reservedDeltaBytes': delta}
        self.ops[op_id] = record
        skill['activePublishOp'] = op_id
        quota['reservedDeltaBytes'] += delta
        return record.copy()

    def patch_operation(self, op_id, fields):
        self.ops[op_id].update(fields)

    def finish_operation(self, row):
        op = self.ops[row['operationId']]
        if op['status'] == 'published':
            return
        skill = self.skills[row['skillId']]
        quota = self._quota(row['ownerKey'])
        quota['publishedBytes'] += op['rawBytes'] - skill.get('latestRawBytes', 0)
        quota['reservedDeltaBytes'] -= op['reservedDeltaBytes']
        op['status'] = 'published'
        skill.update(latestPublishedRevision=row['revision'], latestRawBytes=op['rawBytes'], activePublishOp=None, status='published')

    def fail_operation(self, row: dict, error: str):
        op = self.ops[row['operationId']]
        if op['status'] in ('failed', 'published'):
            return
        self._quota(row['ownerKey'])['reservedDeltaBytes'] -= op['reservedDeltaBytes']
        op.update(status='failed', error=error)
        if self.skills[row['skillId']].get('activePublishOp') == row['operationId']:
            self.skills[row['skillId']]['activePublishOp'] = None
