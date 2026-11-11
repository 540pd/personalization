"""Shared fixtures (#529). Test doubles and builders are in support.py."""
import pytest
from fastapi.testclient import TestClient
from support import FakeRegistry, SlowRegistry, make_parts


@pytest.fixture
def base():
    """(service, store, registry), wired as production wires them, on doubles."""
    parts = make_parts(registry=FakeRegistry())
    return parts.service, parts.store, parts.registry


@pytest.fixture
def slow():
    """As `base`, with a Registry whose operations stay pending until finished."""
    parts = make_parts(registry=SlowRegistry())
    return parts.service, parts.store, parts.registry


@pytest.fixture
def serve():
    """serve(parts, owner='usr_A') → a TestClient on the app with these parts
    and that owner as the caller. Overrides are cleared after the test."""
    from app.main import app, catalog, helper, service
    from app.security import Principal, trusted_node

    def start(parts, owner='usr_A', raise_server_exceptions=True):
        app.dependency_overrides[service] = lambda: parts.service
        app.dependency_overrides[catalog] = lambda: parts.catalog
        app.dependency_overrides[helper] = lambda: parts.helper
        if owner is not None:
            app.dependency_overrides[trusted_node] = lambda: Principal(owner_key=owner, caller_email='unit-test-node')
        return TestClient(app, raise_server_exceptions=raise_server_exceptions)
    yield start
    app.dependency_overrides.clear()
