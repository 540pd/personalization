"""Registry container CRUD and recoverable idempotent revision publishing."""
import hashlib
import json
from fastapi import HTTPException
from .config import Settings
from .models import SkillCreate, PublishRequest, PublishStatus
from .store import key_for, operation_key, stamp
from .registry import RegistryError, operation_uuid, operation_done, explain_registry_error
from .packaging import build_zip
from .catalog import ToolCatalog


def digest(data) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


class SkillService:
    def __init__(self, store, registry, catalog: ToolCatalog, cfg: Settings):
        self.store = store
        self.registry = registry
        self.catalog = catalog
        self.cfg = cfg

    def owned(self, owner: str, skill_id: str) -> dict:
        row = self.store.get_skill(skill_id)
        if not row or row['ownerKey'] != owner:
            raise HTTPException(404, detail='Skill not found')
        return row

    def list_owned(self, owner: str) -> list[dict]:
        return self.store.list_skills(owner)

    async def create(self, owner: str, request: SkillCreate) -> dict:
        # Both Registry and Firestore IDs are stable across retries.
        skill_id = key_for(owner, request.slug)
        registry_slug = f'gcos-{skill_id}'
        resource = f'{self.cfg.registry_parent}/skills/private-{registry_slug}'
        row = self.store.reserve_skill({
            'schemaVersion': 1, 'skillId': skill_id, 'ownerKey': owner,
            'registryResource': resource, 'status': 'creating',
            'createHash': digest(request.model_dump()),
            'createdAt': stamp(), 'updatedAt': stamp(),
            'latestPublishedRevision': None, 'activePublishOp': None,
        })
        if row['status'] != 'creating':
            return row
        # Reconciliation: process could crash after Registry created container but before our local update.
        op = row.get('createOperation')
        try:
            if op:
                result = await self.registry.operation(op)
                if not operation_done(result):
                    return {**row, 'status': 'creating'}
            else:
                try:
                    await self.registry.get_skill(resource)
                except RegistryError as err:
                    if err.status != 404:
                        raise
                    created = await self.registry.create_container(
                        self.cfg.registry_parent, registry_slug, request.display_name,
                        request.description, operation_uuid('create:' + skill_id),
                    )
                    op = created.get('name')
                    if op:
                        self.store.patch_skill(skill_id, {'createOperation': op})
                    if not operation_done(created):
                        return {**row, 'createOperation': op, 'status': 'creating'}
            self.store.patch_skill(skill_id, {'status': 'draft', 'createOperation': None})
            return self.store.get_skill(skill_id)
        except RegistryError as err:
            explain_registry_error(err)

    async def read(self, owner: str, skill_id: str) -> dict:
        row = self.owned(owner, skill_id)
        # Follow any pending disable or metadata change to its end (#506):
        # one Registry read each, safe to repeat.
        await self._reconcile_disable(row)
        await self._reconcile_metadata(self.owned(owner, skill_id))
        row = self.owned(owner, skill_id)
        try:
            registry_meta = await self.registry.get_skill(row['registryResource'])
        except RegistryError as err:
            if row.get('status') == 'creating' and err.status == 404:
                registry_meta = {'state': 'CREATING'}
            else:
                explain_registry_error(err)
        # Registry metadata only: no copies of published SKILL.md.
        return {**row, 'registry': registry_meta}

    async def list_revisions(self, owner: str, skill_id: str) -> dict:
        row = self.owned(owner, skill_id)
        try:
            return await self.registry.list_revisions(row['registryResource'])
        except RegistryError as err:
            explain_registry_error(err)

    async def revision_metadata(self, owner: str, skill_id: str, revision_id: str) -> dict:
        row = self.owned(owner, skill_id)
        try:
            return await self.registry.get_revision(row['registryResource'] + '/revisions/' + revision_id)
        except RegistryError as err:
            explain_registry_error(err)

    async def revision_archive(self, owner: str, skill_id: str, revision_id: str) -> bytes:
        row = self.owned(owner, skill_id)
        try:
            return await self.registry.download_revision(row['registryResource'] + '/revisions/' + revision_id)
        except RegistryError as err:
            explain_registry_error(err)

    async def update_metadata(self, owner: str, skill_id: str, fields: dict) -> dict:
        row = self.owned(owner, skill_id)
        if not fields:
            raise HTTPException(422, detail='At least one field is required')
        try:
            op = await self.registry.patch_skill(
                row['registryResource'], fields, operation_uuid('metadata:' + skill_id + ':' + digest(fields))
            )
        except RegistryError as err:
            explain_registry_error(err)
        # Recorded, so a later read can report the outcome (#506).
        self.store.patch_skill(skill_id, {'metadataOperation': op.get('name'), 'metadataStatus': 'pending', 'lastError': None})
        if op.get('done'):
            return await self._reconcile_metadata(self.owned(owner, skill_id), done=op)
        return {'status': 'pending', 'operation': op.get('name')}

    async def _reconcile_metadata(self, row: dict, done: dict | None = None) -> dict:
        """A pending metadata change: updated or failed once its Registry operation ends."""
        name = row.get('metadataOperation')
        if not name:
            return {'status': row.get('metadataStatus') or 'updated', 'operation': None}
        try:
            result = done or await self.registry.operation(name)
            finished = operation_done(result)
        except RegistryError:
            self.store.patch_skill(row['skillId'], {'metadataOperation': None, 'metadataStatus': 'failed', 'lastError': 'Agent Registry refused the metadata change'})
            return {'status': 'failed', 'operation': name}
        if not finished:
            return {'status': 'pending', 'operation': name}
        self.store.patch_skill(row['skillId'], {'metadataOperation': None, 'metadataStatus': 'updated'})
        return {'status': 'updated', 'operation': name}

    async def disable(self, owner: str, skill_id: str) -> dict:
        row = self.owned(owner, skill_id)
        if row.get('status') == 'disabled':
            return {'status': 'disabled', 'operation': None}
        # Already asked: follow that operation instead of starting another (#506).
        if row.get('status') == 'disable_requested' and row.get('disableOperation'):
            return await self._reconcile_disable(row)
        if row.get('activePublishOp'):
            raise HTTPException(409, detail='A publish is currently in progress')
        try:
            op = await self.registry.patch_skill(row['registryResource'],
                {'targetState': 'TARGET_STATE_DISABLED'},
                operation_uuid('disable:' + skill_id),
            )
        except RegistryError as err:
            explain_registry_error(err)
        self.store.patch_skill(skill_id, {
            'status': 'disable_requested', 'disableOperation': op.get('name'),
            'statusBeforeDisable': row.get('status'), 'lastError': None,
        })
        return await self._reconcile_disable(self.owned(owner, skill_id), done=op if op.get('done') else None)

    async def _reconcile_disable(self, row: dict, done: dict | None = None) -> dict:
        """A requested disable: disabled once its Registry operation ends, or back if refused."""
        if row.get('status') != 'disable_requested':
            return {'status': row.get('status'), 'operation': None}
        name = row.get('disableOperation')
        if not name:
            # Requested before operations were recorded: nothing to follow.
            return {'status': 'disable_requested', 'operation': None}
        try:
            result = done or await self.registry.operation(name)
            finished = operation_done(result)
        except RegistryError:
            previous = row.get('statusBeforeDisable') or 'draft'
            self.store.patch_skill(row['skillId'], {
                'status': previous, 'disableOperation': None, 'lastError': 'Agent Registry refused the disable',
            })
            return {'status': previous, 'operation': name, 'error': 'Agent Registry refused the disable'}
        if not finished:
            return {'status': 'disable_requested', 'operation': name}
        self.store.finish_disable(row['skillId'])
        return {'status': 'disabled', 'operation': name}

    def _operation_response(self, op: dict) -> PublishStatus:
        return PublishStatus(
            operation_id=op['operationId'], status=op['status'],
            revision=op.get('revision'), registry_operation=op.get('registryOperation'),
            error=op.get('error'),
        )

    async def publish(self, owner: str, skill_id: str, body: PublishRequest, idempotency_key: str) -> PublishStatus:
        skill = self.owned(owner, skill_id)
        if skill['status'] in ('creating', 'disable_requested', 'disabled'):
            raise HTTPException(409, detail='Skill container is not ready for publishing')
        validation = self.catalog.validate(body.tool_names)
        if not validation.valid:
            raise HTTPException(422, detail={'invalid_tools': [r.name for r in validation.results if not r.approved]})
        archive, archive_sha = build_zip(body.markdown)
        body_sha = digest({'archiveSha256': archive_sha, 'tools': sorted(body.tool_names)})
        op_id = operation_key(owner, skill_id, idempotency_key)
        revision_id = 'r-' + body_sha[:28]
        revision = skill['registryResource'] + '/revisions/' + revision_id
        op = self.store.reserve_operation({
            'operationId': op_id, 'ownerKey': owner, 'skillId': skill_id,
            'payloadHash': body_sha, 'revision': revision, 'rawBytes': len(body.markdown.strip().encode('utf-8')) + 1, 'status': 'pending',
            'registryOperation': None, 'promotionOperation': None,
            'createdAt': stamp(), 'updatedAt': stamp(),
        })
        return await self._advance(op, archive=archive)

    async def publish_status(self, owner: str, skill_id: str, op_id: str) -> PublishStatus:
        self.owned(owner, skill_id)
        op = self.store.get_operation(op_id)
        if not op or op['ownerKey'] != owner or op['skillId'] != skill_id:
            raise HTTPException(404, detail='Publish operation not found')
        return await self._advance(op, archive=None)

    async def _advance(self, op: dict, archive: bytes | None) -> PublishStatus:
        if op['status'] in ('published', 'failed'):
            return self._operation_response(op)
        parent = op['revision'].split('/revisions/')[0]
        rev_id = op['revision'].split('/')[-1]
        op_id = op['operationId']
        try:
            # Step 1: create or recover the immutable revision.
            if op['status'] in ('pending', 'publishing'):
                lro_name = op.get('registryOperation')
                if lro_name:
                    lro = await self.registry.operation(lro_name)
                    if not operation_done(lro):
                        return self._operation_response({**op, 'status': 'publishing'})
                else:
                    try:
                        revision = await self.registry.get_revision(op['revision'])
                    except RegistryError as err:
                        if err.status != 404:
                            raise
                        if archive is None:
                            # A read-only poll cannot reconstruct the original archive safely.
                            return self._operation_response(op)
                        lro = await self.registry.create_revision(
                            parent, rev_id, archive,
                            operation_uuid('revision:' + op_id),
                        )
                        lro_name = lro.get('name')
                        self.store.patch_operation(op_id, {'status': 'publishing', 'registryOperation': lro_name})
                        if not operation_done(lro):
                            return self._operation_response({**op, 'status': 'publishing', 'registryOperation': lro_name})
                self.store.patch_operation(op_id, {'status': 'pending_activation', 'registryOperation': None})
                op = self.store.get_operation(op_id)

            # Step 2: wait until Registry validates/ingests the revision.
            revision = await self.registry.get_revision(op['revision'])
            if revision.get('state') not in ('ACTIVE', 'STATE_ACTIVE'):
                if revision.get('state') in ('FAILED', 'STATE_FAILED'):
                    self._fail(op, 'Registry rejected revision')
                    return self._operation_response(self.store.get_operation(op_id))
                return self._operation_response({**op, 'status': 'pending_activation'})

            # Step 3: switch default to a vetted revision. Do not declare success until ACTIVE.
            parent_state = await self.registry.get_skill(parent)
            active = parent_state.get('state') in ('ACTIVE', 'STATE_ACTIVE')
            if parent_state.get('defaultRevision') == op['revision'] and active:
                self.store.finish_operation(op)
                return self._operation_response(self.store.get_operation(op_id))
            if op.get('promotionOperation'):
                promotion = await self.registry.operation(op['promotionOperation'])
                if not operation_done(promotion):
                    return self._operation_response({**op, 'status': 'pending_activation'})
                self.store.patch_operation(op_id, {'promotionOperation': None})
                op = self.store.get_operation(op_id)
                # If scanning has delayed active state, do not reissue patch endlessly.
                current = await self.registry.get_skill(parent)
                if current.get('defaultRevision') == op['revision']:
                    return self._operation_response({**op, 'status': 'pending_activation'})
            # Do not turn off scanning. Registry policy determines when ACTIVE is allowed.
            promoted = await self.registry.patch_skill(parent, {
                'defaultRevision': op['revision'], 'targetState': 'TARGET_STATE_ACTIVE',
            }, operation_uuid('promote:' + op_id))
            self.store.patch_operation(op_id, {'promotionOperation': promoted.get('name')})
            return self._operation_response({**op, 'status': 'pending_activation', 'promotionOperation': promoted.get('name')})
        except RegistryError as err:
            if err.status in (400, 422) or (err.status == 502 and 'Registry operation failed' in str(err)):
                self._fail(op, 'Registry validation rejected this publish')
                return self._operation_response(self.store.get_operation(op_id))
            explain_registry_error(err)

    def _fail(self, op: dict, msg: str):
        self.store.fail_operation(op, msg)
