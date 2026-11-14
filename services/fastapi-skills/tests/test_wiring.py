"""One wiring point (#529): the app and the operator CLI build their parts
with build_services, and it makes nothing that is passed in."""
import asyncio
import pytest
from fastapi.testclient import TestClient
from app import config, operator, store as store_module, wiring
from app.main import app
from support import CONFIGURED, FakeRegistry, make_parts, make_settings


def test_parts_share_the_store_and_catalog():
    parts = make_parts()
    assert parts.service.store is parts.store and parts.helper.store is parts.store
    assert parts.service.catalog is parts.catalog and parts.helper.catalog is parts.catalog
    assert parts.service.registry is parts.registry


def test_nothing_passed_in_is_made(monkeypatch):
    def no_firestore(*_, **__):
        raise AssertionError('a Firestore client was made')
    monkeypatch.setattr(store_module.FirestoreStore, '__init__', no_firestore)
    make_parts()  # store and registry given: neither production client is made


def test_the_production_parts_are_made_when_not_passed(monkeypatch):
    made = []
    monkeypatch.setattr(store_module.FirestoreStore, '__init__', lambda self, *a, **k: made.append('firestore'))
    parts = wiring.build_services(make_settings(), registry=FakeRegistry())
    assert made == ['firestore'] and isinstance(parts.store, store_module.FirestoreStore)


def test_one_clock_reaches_every_part(clock):
    parts = make_parts(clock=clock)
    assert parts.service.clock is clock and parts.helper.clock is clock
    assert parts.store.clock is clock and parts.service.publishing.clock is clock


def test_the_app_starts_on_build_services(monkeypatch):
    for key, value in CONFIGURED.items():
        monkeypatch.setenv(key, value)
    monkeypatch.chdir('/')
    config.settings.cache_clear()
    parts = make_parts()
    calls = []
    monkeypatch.setattr('app.main.build_services', lambda cfg: calls.append(cfg) or parts)
    try:
        with TestClient(app):
            assert app.state.service is parts.service and app.state.helper is parts.helper
    finally:
        config.settings.cache_clear()
    assert len(calls) == 1


def test_the_operator_cli_runs_on_build_services(monkeypatch):
    parts = make_parts()
    monkeypatch.setattr(wiring, 'build_services', lambda cfg: parts)
    monkeypatch.setattr(operator, 'adc_account', lambda: None)
    args = type('Args', (), {'action': 'fail', 'operation_id': 'missing', 'operator': 'ops@example.com', 'reason': 'test', 'force': False})()
    with pytest.raises(Exception) as failure:
        asyncio.run(operator._run(args))
    assert getattr(failure.value, 'status_code', None) == 404  # reached the injected store
