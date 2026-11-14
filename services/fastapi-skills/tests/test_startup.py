"""Startup refuses a misconfigured service (#515): the lifespan handler's checks."""
import pytest
from fastapi.testclient import TestClient
from app import config
from app.main import app
from support import CONFIGURED


@pytest.fixture(autouse=True)
def fresh_settings(monkeypatch):
    for key in [*CONFIGURED, 'DEV_BYPASS_AUTH', 'K_SERVICE']:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.chdir('/')  # no .env file is read
    config.settings.cache_clear()
    yield
    config.settings.cache_clear()


def start():
    with TestClient(app):
        pass


@pytest.mark.parametrize('missing', ['GOOGLE_CLOUD_PROJECT', 'FIRESTORE_PROJECT_ID'])
def test_refuses_to_start_without_its_projects(monkeypatch, missing):
    for key, value in CONFIGURED.items():
        if key != missing:
            monkeypatch.setenv(key, value)
    with pytest.raises(RuntimeError, match='GOOGLE_CLOUD_PROJECT and FIRESTORE_PROJECT_ID'):
        start()


@pytest.mark.parametrize('missing', ['FASTAPI_AUDIENCE', 'NODE_SERVICE_ACCOUNT'])
def test_refuses_to_start_without_the_caller_check(monkeypatch, missing):
    for key, value in CONFIGURED.items():
        if key != missing:
            monkeypatch.setenv(key, value)
    with pytest.raises(RuntimeError, match='FASTAPI_AUDIENCE and NODE_SERVICE_ACCOUNT'):
        start()


def test_refuses_the_dev_bypass_on_cloud_run(monkeypatch):
    for key, value in CONFIGURED.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv('DEV_BYPASS_AUTH', 'true')
    monkeypatch.setenv('K_SERVICE', 'gcos-fastapi')
    with pytest.raises(RuntimeError, match='DEV_BYPASS_AUTH must never be enabled in Cloud Run'):
        start()
