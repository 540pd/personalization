"""The versioned tool catalog (#510): a revision in every result, a bounded
cache so a withdrawn tool fails soon, and no fallback when it can't be read."""
import json
import shutil
from pathlib import Path
import pytest
from fastapi import HTTPException
from app.catalog import (ToolCatalog, FileCatalogProvider, RegistryCatalogProvider,
                         CatalogSnapshot, CatalogUnavailable, catalog_from_settings)
from app.config import Settings
from app.models import SkillCreate, PublishRequest
from support import MD, make_parts

DATA = Path(__file__).resolve().parent.parent / 'data'


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def catalog_file(tmp_path):
    path = tmp_path / 'tool_catalog.json'
    shutil.copy(DATA / 'tool_catalog.json', path)
    return path


def withdraw(path: Path, name: str):
    obj = json.loads(path.read_text())
    for item in obj['tools']:
        if item['name'] == name:
            item['approved'] = False
    path.write_text(json.dumps(obj))


def test_every_result_carries_the_revision():
    check = ToolCatalog(DATA / 'tool_catalog.json').validate(['brand.read', 'nope'])
    assert check.catalog_revision.startswith('file-v1-')
    assert len(check.catalog_revision) == len('file-v1-') + 12
    assert not check.valid and check.results[0].approved


def test_revision_follows_the_content(catalog_file):
    before = FileCatalogProvider(catalog_file).load().revision
    withdraw(catalog_file, 'brand.read')
    assert FileCatalogProvider(catalog_file).load().revision != before


def test_withdrawn_tool_fails_once_the_cache_expires(catalog_file):
    clock = Clock()
    catalog = ToolCatalog(catalog_file, cache_seconds=60, clock=clock)
    first = catalog.validate(['brand.read'])
    assert first.valid
    withdraw(catalog_file, 'brand.read')
    clock.now += 59
    assert catalog.validate(['brand.read']).valid  # still inside the 60 s window
    clock.now += 1
    later = catalog.validate(['brand.read'])
    assert not later.valid
    assert later.catalog_revision != first.catalog_revision


def test_unreadable_catalog_fails_closed_without_stale_fallback(catalog_file):
    clock = Clock()
    catalog = ToolCatalog(catalog_file, clock=clock)
    assert catalog.validate(['brand.read']).valid
    catalog_file.write_text('{not json')
    clock.now += 60
    with pytest.raises(HTTPException) as failure:
        catalog.validate(['brand.read'])
    assert failure.value.status_code == 503
    # It keeps failing (no cached copy is reused) until the source is readable.
    with pytest.raises(HTTPException):
        catalog.validate(['brand.read'])
    shutil.copy(DATA / 'tool_catalog.json', catalog_file)
    assert catalog.validate(['brand.read']).valid


def test_missing_catalog_file_fails_at_startup(tmp_path):
    with pytest.raises(HTTPException) as failure:
        ToolCatalog(tmp_path / 'missing.json')
    assert failure.value.status_code == 503


def test_registry_source_is_a_closed_placeholder():
    with pytest.raises(CatalogUnavailable):
        RegistryCatalogProvider().load()
    catalog = catalog_from_settings(Settings(catalog_source='registry'), DATA)
    with pytest.raises(HTTPException) as failure:
        catalog.validate(['brand.read'])
    assert failure.value.status_code == 503


def test_unknown_source_is_refused():
    with pytest.raises(RuntimeError):
        catalog_from_settings(Settings(catalog_source='anything'), DATA)


def test_input_schema_flag():
    class Provider:
        def load(self):
            return CatalogSnapshot('test-1', {
                'with.schema': {'name': 'with.schema', 'approved': True, 'input_schema': {'type': 'object'}},
                'no.schema': {'name': 'no.schema', 'approved': True},
            })
    results = ToolCatalog(Provider()).validate(['with.schema', 'no.schema']).results
    assert [r.input_schema for r in results] == [True, False]


@pytest.mark.asyncio
async def test_publish_records_the_revision(catalog_file):
    cat = ToolCatalog(catalog_file)
    svc = make_parts(catalog=cat).service
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    result = await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=MD, tool_names=['brand.read']), 'req-12345678')
    revision = cat.validate([]).catalog_revision
    assert result.catalog_revision == revision
    polled = await svc.publish_status('usr_A', created['skillId'], result.operation_id)
    assert polled.catalog_revision == revision


@pytest.mark.asyncio
async def test_rejected_publish_names_the_revision(catalog_file):
    withdraw(catalog_file, 'brand.read')
    cat = ToolCatalog(catalog_file)
    svc = make_parts(catalog=cat).service
    created = await svc.create('usr_A', SkillCreate(slug='premium-copy', display_name='Premium copy', description='Writes approved brand copy'))
    with pytest.raises(HTTPException) as failure:
        await svc.publish('usr_A', created['skillId'], PublishRequest(markdown=MD, tool_names=['brand.read']), 'req-12345678')
    assert failure.value.status_code == 422
    assert failure.value.detail['invalid_tools'] == ['brand.read']
    assert failure.value.detail['catalog_revision'].startswith('file-v1-')
