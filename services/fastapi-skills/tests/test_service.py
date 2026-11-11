import io
import zipfile
import pytest
from fastapi import HTTPException
from app.config import Settings
from app.catalog import ToolCatalog
from app.models import SkillCreate, PublishRequest
from app.service import SkillService
from app.store import MemoryStore
from app.registry import RegistryError
from app.packaging import build_zip
from pathlib import Path

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


@pytest.fixture
def base():
    root = Path(__file__).parent.parent
    store = MemoryStore()
    registry = FakeRegistry()
    cat = ToolCatalog(root / 'data' / 'tool_catalog.json')
    cfg = Settings(google_cloud_project='test-project', registry_location='us')
    return SkillService(store, registry, cat, cfg), store, registry


@pytest.mark.asyncio
async def test_publish_idempotency_and_registry_only_content(base):
    svc, store, registry = base
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    assert created['status'] == 'draft'
    key = created['skillId']
    result = await svc.publish('usr_A', key, PublishRequest(markdown=MD, tool_names=['brand.read']), 'req-12345678')
    assert result.status == 'pending_activation'
    result = await svc.publish_status('usr_A', key, result.operation_id)
    assert result.status == 'published'
    again = await svc.publish('usr_A', key, PublishRequest(markdown=MD, tool_names=['brand.read']), 'req-12345678')
    assert again.status == 'published'
    assert registry.revision_calls == 1
    # Firestore ownership and op metadata must never contain SKILL.md text.
    assert 'premium-tone' not in str(store.skills)
    assert 'premium-tone' not in str(store.ops)


@pytest.mark.asyncio
async def test_cross_owner_denial(base):
    svc, *_ = base
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_B', created['skillId'], PublishRequest(markdown=MD), 'requestid11')
    assert failure.value.status_code == 404
    assert not svc.list_owned('usr_B')


@pytest.mark.asyncio
async def test_publish_same_key_changed_body_conflicts(base):
    svc, *_ = base
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=MD), 'requestid22')
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=MD + '\nAnother rule\n'), 'requestid22')
    assert failure.value.status_code == 409


def test_package_deterministic():
    a, sha_a = build_zip(MD)
    b, sha_b = build_zip(MD)
    assert a == b
    assert sha_a == sha_b


def test_catalog_rejects_unknown(base):
    svc, *_ = base
    check = svc.catalog.validate(['brand.read', 'other-user.assets.dump'])
    assert not check.valid
    assert check.results[1].approved is False

@pytest.mark.asyncio
async def test_max_five_skills_per_owner(base):
    svc, *_ = base
    for i in range(5):
        await svc.create('usr_A', SkillCreate(slug=f'example-{i:02d}', display_name=f'Example {i}', description='Long enough skill description'))
    with pytest.raises(HTTPException) as error:
        await svc.create('usr_A', SkillCreate(slug='example-05', display_name='Example 5', description='Long enough skill description'))
    assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_combined_300_kib_budget(base):
    svc, store, registry = base
    large_md = MD + ('This is an approved instruction sentence. ' * 2400)
    assert len(large_md.encode('utf-8')) < 100 * 1024
    # Each of the first three is about 91 KiB; the fourth would cross 300 KiB.
    for i in range(3):
        created = await svc.create('usr_A', SkillCreate(slug=f'example-{i:02d}', display_name=f'Example {i}', description='Long enough skill description'))
        published = await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=large_md), f'large-{i}-request')
        await svc.publish_status('usr_A', created['skillId'], published.operation_id)
    created = await svc.create('usr_A', SkillCreate(slug='example-04', display_name='Example 4', description='Long enough skill description'))
    with pytest.raises(HTTPException) as error:
        await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=large_md), 'large-4-request')
    assert error.value.status_code == 422
