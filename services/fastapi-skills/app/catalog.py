"""The approved tool catalog (#510, PACK PY-03 scope 1 and 4). Validation reads
it through a CatalogProvider, so its source can change by config, and every
result says which catalog revision it was checked against. A catalog that
can't be read fails closed (503): it is never a fallback that allows
everything. Runtime authorizations are checked again by the ADK tools."""
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol
from .clock import SYSTEM, Clock
from .models import ToolValidationResponse, ToolResult
from . import codes
from .errors import ServiceError

DEFAULT_CACHE_SECONDS = 60


@dataclass(frozen=True)
class CatalogSnapshot:
    revision: str
    entries: dict = field(default_factory=dict)


class CatalogUnavailable(Exception):
    """The catalog's source can't be read right now."""


class CatalogProvider(Protocol):
    def load(self) -> CatalogSnapshot:
        """The current catalog. Raises CatalogUnavailable when it can't be read."""
        ...


class FileCatalogProvider:
    """A reviewed JSON file (data/tool_catalog.json). Its revision is its
    `version` plus a hash of its content, so an edited file gets a new revision
    even if nobody bumps the version."""
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def load(self) -> CatalogSnapshot:
        try:
            raw = self.path.read_bytes()
            obj = json.loads(raw)
            entries = {item['name']: item for item in obj['tools']}
            version = obj.get('version', 0)
        except (OSError, ValueError, KeyError, TypeError) as err:
            raise CatalogUnavailable('The tool catalog file could not be read') from err
        return CatalogSnapshot(revision=f'file-v{version}-{hashlib.sha256(raw).hexdigest()[:12]}', entries=entries)


class RegistryCatalogProvider:
    """PLACEHOLDER (#510): the approved MCP catalog in Agent Registry. No API for
    it has been confirmed yet, so this source fails closed instead of guessing
    one: with CATALOG_SOURCE=registry every validation answers 503."""
    def load(self) -> CatalogSnapshot:
        raise CatalogUnavailable('The Agent Registry tool catalog is not available yet')


class ToolCatalog:
    """Validates tool names against the provider's catalog, cached for
    `cache_seconds` (default 60): a withdrawn tool fails validation at most that
    long after its source changes."""
    def __init__(self, source: 'CatalogProvider | str | Path', cache_seconds: float = DEFAULT_CACHE_SECONDS, clock: Clock = SYSTEM, load_now: bool = True):
        self.provider = source if hasattr(source, 'load') else FileCatalogProvider(source)
        self.cache_seconds = cache_seconds
        self.clock = clock
        self._snapshot: CatalogSnapshot | None = None
        self._loaded_at = 0.0
        if load_now:
            self.snapshot()  # a catalog file that can't be read is caught at startup

    def snapshot(self) -> CatalogSnapshot:
        now = self.clock.monotonic()
        if self._snapshot is None or now - self._loaded_at >= self.cache_seconds:
            try:
                snapshot = self.provider.load()
            except CatalogUnavailable:
                # No stale fallback: an expired catalog is not trusted.
                self._snapshot = None
                raise ServiceError(503, codes.DEPENDENCY, 'The approved tool catalog is unavailable. Try again shortly.') from None
            self._snapshot, self._loaded_at = snapshot, now
        return self._snapshot

    @property
    def entries(self) -> dict:
        return self.snapshot().entries

    def validate(self, names: list[str]) -> ToolValidationResponse:
        catalog = self.snapshot()
        results = []
        seen = set()
        for name in names:
            entry = catalog.entries.get(name)
            if name in seen:
                results.append(ToolResult(name=name, approved=False, reason='duplicate'))
            elif not entry or not entry.get('approved', False):
                results.append(ToolResult(name=name, approved=False, reason='not in approved tool catalog'))
            else:
                # Declarations carry names only (#509), so there are no arguments
                # to check yet; say whether the catalog has a schema for them.
                results.append(ToolResult(name=name, approved=True, reason='approved by catalog', input_schema=bool(entry.get('input_schema'))))
            seen.add(name)
        return ToolValidationResponse(valid=all(item.approved for item in results), results=results, catalog_revision=catalog.revision)


def catalog_from_settings(cfg, data_dir: Path, clock: Clock = SYSTEM) -> ToolCatalog:
    """The catalog CATALOG_SOURCE names: `file` (default) or `registry` (placeholder, fails closed)."""
    if cfg.catalog_source == 'file':
        return ToolCatalog(data_dir / 'tool_catalog.json', cfg.catalog_cache_seconds, clock)
    if cfg.catalog_source == 'registry':
        # The service still starts; every validation answers 503 until it exists.
        return ToolCatalog(RegistryCatalogProvider(), cfg.catalog_cache_seconds, clock, load_now=False)
    raise RuntimeError(f'CATALOG_SOURCE must be file or registry, got {cfg.catalog_source!r}')
