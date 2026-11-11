"""Shared test doubles and wiring (#529). Fixtures are in conftest.py."""
import io
import zipfile
from pathlib import Path
from app.config import Settings
from app.llm import FakeLLMClient
from app.registry import RegistryError
from app.store import MemoryStore
from app.wiring import build_services

DATA = Path(__file__).resolve().parent.parent / 'data'
# Environment a correctly configured service starts with.
CONFIGURED = {
    'GOOGLE_CLOUD_PROJECT': 'gcos-governance-test',
    'FIRESTORE_PROJECT_ID': 'gcos-governance-test',
    'FASTAPI_AUDIENCE': 'https://fastapi.example.run.app',
    'NODE_SERVICE_ACCOUNT': 'node-bff@gcos.iam.gserviceaccount.com',
}

MD = '''---
name: premium-tone
description: Produces short product-oriented premium brand copy.
---
# Purpose
Write concise premium copy that follows the brand restrictions.
# Procedure
Check brief, prepare text, and review for unsupported claims.
'''


class FakeRegistry:
    def __init__(self):
        self.skills = {}
        self.revisions = {}
        self.revision_calls = 0

    async def get_skill(self, resource):
        if resource not in self.skills:
            raise RegistryError(404, 'not found')
        return self.skills[resource]

    async def create_container(self, parent, identifier, title, description, request_id):
        name = f'{parent}/skills/private-{identifier}'
        self.skills[name] = {'name': name, 'state': 'STATE_DRAFT', 'displayName': title}
        return {'done': True, 'name': f'{parent}/operations/create1'}

    async def get_revision(self, resource):
        if resource not in self.revisions:
            raise RegistryError(404, 'not found')
        return self.revisions[resource]

    async def create_revision(self, parent, revision_id, archive, request_id):
        self.revision_calls += 1
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            assert z.namelist() == ['SKILL.md']
        revision = f'{parent}/revisions/{revision_id}'
        self.revisions[revision] = {'name': revision, 'state': 'ACTIVE'}
        return {'done': True, 'name': f'{parent}/operations/rev1'}

    async def patch_skill(self, resource, fields, request_id):
        if resource not in self.skills:
            raise RegistryError(404, 'not found')
        self.skills[resource].update(fields)
        if fields.get('targetState') == 'TARGET_STATE_ACTIVE':
            self.skills[resource]['state'] = 'STATE_ACTIVE'
        elif fields.get('targetState') == 'TARGET_STATE_DISABLED':
            self.skills[resource]['state'] = 'STATE_DISABLED'
        return {'done': True, 'name': 'projects/test-project/locations/us/operations/promote1'}

    async def operation(self, name):
        return {'name': name, 'done': True}


class SlowRegistry(FakeRegistry):
    """Operations stay pending until `finish(name)`, or fail with `fail(name)`."""
    def __init__(self):
        super().__init__()
        self.ops = {}
        self.patch_calls = []

    async def patch_skill(self, resource, fields, request_id):
        await super().patch_skill(resource, fields, request_id)
        name = f'operations/{request_id}'
        self.patch_calls.append((fields, request_id))
        self.ops.setdefault(name, {'name': name, 'done': False})
        return dict(self.ops[name])

    async def operation(self, name):
        return dict(self.ops.get(name, {'name': name, 'done': True}))

    def finish(self, name):
        self.ops[name] = {'name': name, 'done': True}

    def fail(self, name):
        self.ops[name] = {'name': name, 'done': True, 'error': {'code': 9}}


def make_settings(**over) -> Settings:
    return Settings(**{'google_cloud_project': 'test-project', 'registry_location': 'us', **over})


def make_parts(cfg: Settings | None = None, *, store=None, registry=None, llm=None, **kw):
    """The service's parts as production wires them, on test doubles."""
    return build_services(cfg or make_settings(), store=store if store is not None else MemoryStore(),
                          registry=registry if registry is not None else FakeRegistry(),
                          llm=llm if llm is not None else FakeLLMClient([]), **kw)
