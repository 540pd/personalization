"""The Skills service (#530): Skill CRUD and ownership here; disable and
metadata in lifecycle.py; publishing in publish.py. SkillService is the one
front the routes, the operator CLI and the tests call."""
from .catalog import ToolCatalog
from .config import Settings
from .deps import Deps, Part, digest
from .lifecycle import Lifecycle
from .models import SkillCreate, PublishRequest, PublishStatus
from .publish import UPLOAD_TIMEOUT, PublishFlow  # noqa: F401 (UPLOAD_TIMEOUT re-exported)
from .registry import RegistryError, explain_registry_error, operation_done, operation_uuid
from .clock import SYSTEM, Clock
from .store import key_for


def _shared(name):
    """A dependency read from, and swapped on, the shared Deps."""
    return property(lambda self: getattr(self.deps, name), lambda self, value: setattr(self.deps, name, value))


class SkillService(Part):
    store = _shared('store')
    registry = _shared('registry')
    catalog = _shared('catalog')
    cfg = _shared('cfg')
    clock = _shared('clock')

    def __init__(self, store, registry, catalog: ToolCatalog, cfg: Settings, clock: Clock = SYSTEM):
        super().__init__(Deps(store, registry, catalog, cfg, clock))
        self.lifecycle = Lifecycle(self.deps)
        self.publishing = PublishFlow(self.deps)

    def list_owned(self, owner: str, include_disabled: bool = False) -> list[dict]:
        return self.store.list_skills(owner, include_disabled)

    async def create(self, owner: str, request: SkillCreate) -> dict:
        # Both Registry and Firestore IDs are stable across retries.
        skill_id = key_for(owner, request.slug)
        registry_slug = f'gcos-{skill_id}'
        resource = f'{self.cfg.registry_parent}/skills/private-{registry_slug}'
        row = self.store.reserve_skill({
            'schemaVersion': 1, 'skillId': skill_id, 'ownerKey': owner,
            'registryResource': resource, 'status': 'creating',
            'createHash': digest(request.model_dump()),
            'createdAt': self.clock.stamp(), 'updatedAt': self.clock.stamp(),
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
        await self.lifecycle.reconcile_disable(row)
        await self.lifecycle.reconcile_metadata(self.owned(owner, skill_id))
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

    # ── Disable and metadata (lifecycle.py) ──

    async def update_metadata(self, owner: str, skill_id: str, fields: dict) -> dict:
        return await self.lifecycle.update_metadata(owner, skill_id, fields)

    async def disable(self, owner: str, skill_id: str) -> dict:
        return await self.lifecycle.disable(owner, skill_id)

    # ── Publishing (publish.py) ──

    async def publish(self, owner: str, skill_id: str, body: PublishRequest, idempotency_key: str) -> PublishStatus:
        return await self.publishing.publish(owner, skill_id, body, idempotency_key)

    async def publish_status(self, owner: str, skill_id: str, op_id: str) -> PublishStatus:
        return await self.publishing.status(owner, skill_id, op_id)

    async def advance_operation(self, op_id: str) -> PublishStatus:
        """For the operator tool (#508)."""
        return await self.publishing.advance_operation(op_id)
