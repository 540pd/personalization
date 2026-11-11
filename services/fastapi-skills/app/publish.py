"""Idempotent, recoverable publishing (#496, #508, #530): reserve, upload the
revision, wait for it to be active, make it the default; a poll or the next
publish advances it, and one that never reached the Registry times out."""
from datetime import datetime
from .deps import Part, digest
from .models import PublishRequest, PublishStatus
from .publish_op import PublishOp, State
from .packaging import build_zip, declared_tools, validate_markdown
from .registry import RegistryError, explain_registry_error, operation_done, operation_uuid
from .store import operation_key
from . import codes
from .errors import ServiceError

UPLOAD_TIMEOUT = 'Publish timed out before upload; publish again'


class PublishFlow(Part):
    def _load(self, op_id: str) -> PublishOp | None:
        row = self.store.get_operation(op_id)
        return PublishOp.from_row(row) if row else None

    def _past_upload_deadline(self, op: PublishOp) -> bool:
        created = datetime.fromisoformat(op.created_at).timestamp()
        return self.clock.time() - created >= self.cfg.publish_upload_deadline_seconds

    def response(self, op: PublishOp) -> PublishStatus:
        return PublishStatus(
            operation_id=op.operation_id, status=op.status, revision=op.revision,
            registry_operation=op.registry_operation, error=op.error, catalog_revision=op.catalog_revision,
        )

    async def publish(self, owner: str, skill_id: str, body: PublishRequest, idempotency_key: str) -> PublishStatus:
        skill = self.owned(owner, skill_id)
        if skill['status'] in ('creating', 'disable_requested', 'disabled'):
            raise ServiceError(409, codes.CONFLICT, 'Skill container is not ready for publishing')
        # The tools the Markdown itself declares (#509), not only the list sent
        # beside it: each must be listed in tool_names, which the catalog checks.
        declared = declared_tools(validate_markdown(body.markdown))
        not_listed = [name for name in declared if name not in body.tool_names]
        if not_listed:
            raise ServiceError(422, codes.VALIDATION, {'tools_not_listed': not_listed})
        validation = self.catalog.validate(body.tool_names)
        # A publish nobody polls would block this Skill for good (#508): read it
        # first, so one past its upload deadline times out and frees the Skill.
        active = skill.get('activePublishOp')
        if active and active != operation_key(owner, skill_id, idempotency_key):
            stuck = self._load(active)
            if stuck:
                await self.advance(stuck, archive=None)
        if not validation.valid:
            raise ServiceError(422, codes.TOOL_NOT_APPROVED, {'invalid_tools': [r.name for r in validation.results if not r.approved],
                                             'catalog_revision': validation.catalog_revision})
        archive, archive_sha = build_zip(body.markdown)
        body_sha = digest({'archiveSha256': archive_sha, 'tools': sorted(body.tool_names)})
        op_id = operation_key(owner, skill_id, idempotency_key)
        revision_id = 'r-' + body_sha[:28]
        revision = skill['registryResource'] + '/revisions/' + revision_id
        op = PublishOp(
            operation_id=op_id, owner_key=owner, skill_id=skill_id, payload_hash=body_sha, revision=revision,
            raw_bytes=len(body.markdown.strip().encode('utf-8')) + 1, status=State.PENDING,
            catalog_revision=validation.catalog_revision,
            # From the same clock the upload deadline is measured with.
            created_at=self.clock.stamp(), updated_at=self.clock.stamp(),
        )
        # The same key returns the operation already reserved for it.
        reserved = PublishOp.from_row(self.store.reserve_operation(op.to_row()))
        return await self.advance(reserved, archive=archive)

    async def status(self, owner: str, skill_id: str, op_id: str) -> PublishStatus:
        self.owned(owner, skill_id)
        op = self._load(op_id)
        if not op or op.owner_key != owner or op.skill_id != skill_id:
            raise ServiceError(404, codes.NOT_ACCESSIBLE, 'Publish operation not found')
        return await self.advance(op, archive=None)

    async def advance(self, op: PublishOp, archive: bytes | None) -> PublishStatus:
        if op.finished:
            return self.response(op)
        parent, rev_id, op_id = op.skill_resource, op.revision_id, op.operation_id
        try:
            # Step 1: create or recover the immutable revision.
            if op.status in State.UPLOADING:
                lro_name = op.registry_operation
                if lro_name:
                    lro = await self.registry.operation(lro_name)
                    if not operation_done(lro):
                        return self.response(op.with_(status=State.PUBLISHING))
                else:
                    try:
                        revision = await self.registry.get_revision(op.revision)
                    except RegistryError as err:
                        if err.status != 404:
                            raise
                        if self._past_upload_deadline(op):
                            # Never reached the Registry (#508): no revision and no
                            # recorded operation. One that did is reconciled instead.
                            self._fail(op, UPLOAD_TIMEOUT)
                            return self.response(self._load(op_id))
                        if archive is None:
                            # A read-only poll cannot reconstruct the original archive safely.
                            return self.response(op)
                        lro = await self.registry.create_revision(
                            parent, rev_id, archive,
                            operation_uuid('revision:' + op_id),
                        )
                        lro_name = lro.get('name')
                        self.store.patch_operation(op_id, {'status': State.PUBLISHING, 'registryOperation': lro_name})
                        if not operation_done(lro):
                            return self.response(op.with_(status=State.PUBLISHING, registry_operation=lro_name))
                self.store.patch_operation(op_id, {'status': State.PENDING_ACTIVATION, 'registryOperation': None})
                op = self._load(op_id)

            # Step 2: wait until Registry validates/ingests the revision.
            revision = await self.registry.get_revision(op.revision)
            if revision.get('state') not in ('ACTIVE', 'STATE_ACTIVE'):
                if revision.get('state') in ('FAILED', 'STATE_FAILED'):
                    self._fail(op, 'Registry rejected revision')
                    return self.response(self._load(op_id))
                return self.response(op.with_(status=State.PENDING_ACTIVATION))

            # Step 3: switch default to a vetted revision. Do not declare success until ACTIVE.
            parent_state = await self.registry.get_skill(parent)
            active = parent_state.get('state') in ('ACTIVE', 'STATE_ACTIVE')
            if parent_state.get('defaultRevision') == op.revision and active:
                self.store.finish_operation(op.to_row())
                return self.response(self._load(op_id))
            if op.promotion_operation:
                promotion = await self.registry.operation(op.promotion_operation)
                if not operation_done(promotion):
                    return self.response(op.with_(status=State.PENDING_ACTIVATION))
                self.store.patch_operation(op_id, {'promotionOperation': None})
                op = self._load(op_id)
                # If scanning has delayed active state, do not reissue patch endlessly.
                current = await self.registry.get_skill(parent)
                if current.get('defaultRevision') == op.revision:
                    return self.response(op.with_(status=State.PENDING_ACTIVATION))
            # Do not turn off scanning. Registry policy determines when ACTIVE is allowed.
            promoted = await self.registry.patch_skill(parent, {
                'defaultRevision': op.revision, 'targetState': 'TARGET_STATE_ACTIVE',
            }, operation_uuid('promote:' + op_id))
            self.store.patch_operation(op_id, {'promotionOperation': promoted.get('name')})
            return self.response(op.with_(status=State.PENDING_ACTIVATION, promotion_operation=promoted.get('name')))
        except RegistryError as err:
            if err.status in (400, 422) or (err.status == 502 and 'Registry operation failed' in str(err)):
                self._fail(op, 'Registry validation rejected this publish')
                return self.response(self._load(op_id))
            explain_registry_error(err)

    def _fail(self, op: PublishOp, msg: str) -> bool:
        return self.store.fail_operation(op.to_row(), msg)

    async def advance_operation(self, op_id: str) -> PublishStatus:
        """Reconcile one operation from the Registry's state, as a poll would.
        For the operator tool (#508); the Node routes go through publish_status."""
        op = self._load(op_id)
        if not op:
            raise ServiceError(404, codes.NOT_ACCESSIBLE, 'Publish operation not found')
        return await self.advance(op, archive=None)
