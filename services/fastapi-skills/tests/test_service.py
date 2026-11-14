"""Skill CRUD and ownership (service.py, #530). Publishing is in test_publish.py,
disable and metadata in test_lifecycle.py."""
import pytest
from fastapi import HTTPException
from app.models import SkillCreate, PublishRequest
from app.packaging import build_zip
from support import MD

@pytest.mark.asyncio
async def test_cross_owner_denial(base):
    svc, *_ = base
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_B', created['skillId'], PublishRequest(markdown=MD), 'requestid11')
    assert failure.value.status_code == 404
    assert not svc.list_owned('usr_B')


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
