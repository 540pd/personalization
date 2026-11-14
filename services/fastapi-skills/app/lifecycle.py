"""Disable and metadata changes (#506, #530): each starts a Registry operation,
records it, and is finished by a later read once the operation ends."""
from .deps import Part, digest
from .registry import DONE, PENDING, RegistryError, explain_registry_error, follow_operation, operation_uuid
from . import codes
from .errors import ServiceError


class Lifecycle(Part):
    async def update_metadata(self, owner: str, skill_id: str, fields: dict) -> dict:
        row = self.owned(owner, skill_id)
        if not fields:
            raise ServiceError(422, codes.VALIDATION, 'At least one field is required')
        try:
            op = await self.registry.patch_skill(
                row['registryResource'], fields, operation_uuid('metadata:' + skill_id + ':' + digest(fields))
            )
        except RegistryError as err:
            explain_registry_error(err)
        # Recorded, so a later read can report the outcome (#506).
        self.store.patch_skill(skill_id, {'metadataOperation': op.get('name'), 'metadataStatus': 'pending', 'lastError': None})
        if op.get('done'):
            return await self.reconcile_metadata(self.owned(owner, skill_id), done=op)
        return {'status': 'pending', 'operation': op.get('name')}

    async def reconcile_metadata(self, row: dict, done: dict | None = None) -> dict:
        """A pending metadata change: updated or failed once its Registry operation ends."""
        name = row.get('metadataOperation')
        if not name:
            return {'status': row.get('metadataStatus') or 'updated', 'operation': None}
        outcome = await follow_operation(self.registry, name, done)
        if outcome == PENDING:
            return {'status': 'pending', 'operation': name}
        if outcome == DONE:
            self.store.patch_skill(row['skillId'], {'metadataOperation': None, 'metadataStatus': 'updated'})
            return {'status': 'updated', 'operation': name}
        self.store.patch_skill(row['skillId'], {'metadataOperation': None, 'metadataStatus': 'failed', 'lastError': 'Agent Registry refused the metadata change'})
        return {'status': 'failed', 'operation': name}

    async def disable(self, owner: str, skill_id: str) -> dict:
        row = self.owned(owner, skill_id)
        if row.get('status') == 'disabled':
            return {'status': 'disabled', 'operation': None}
        # Already asked: follow that operation instead of starting another (#506).
        if row.get('status') == 'disable_requested' and row.get('disableOperation'):
            return await self.reconcile_disable(row)
        if row.get('activePublishOp'):
            raise ServiceError(409, codes.PUBLISH_IN_PROGRESS, 'A publish is currently in progress')
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
        return await self.reconcile_disable(self.owned(owner, skill_id), done=op if op.get('done') else None)

    async def reconcile_disable(self, row: dict, done: dict | None = None) -> dict:
        """A requested disable: disabled once its Registry operation ends, or back if refused."""
        if row.get('status') != 'disable_requested':
            return {'status': row.get('status'), 'operation': None}
        name = row.get('disableOperation')
        if not name:
            # Requested before operations were recorded: nothing to follow.
            return {'status': 'disable_requested', 'operation': None}
        outcome = await follow_operation(self.registry, name, done)
        if outcome == PENDING:
            return {'status': 'disable_requested', 'operation': name}
        if outcome == DONE:
            self.store.finish_disable(row['skillId'])
            return {'status': 'disabled', 'operation': name}
        previous = row.get('statusBeforeDisable') or 'draft'
        self.store.patch_skill(row['skillId'], {
            'status': previous, 'disableOperation': None, 'lastError': 'Agent Registry refused the disable',
        })
        return {'status': previous, 'operation': name, 'error': 'Agent Registry refused the disable'}
