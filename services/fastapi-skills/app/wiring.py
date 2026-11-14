"""Builds the service's parts in one place (#529): the app's startup, the
operator CLI and the tests all call build_services, so they can't be wired
differently. Pass a part to use it instead of the production one; nothing
is made that is passed in (no Firestore or Registry client in tests)."""
from dataclasses import dataclass
from pathlib import Path
from .catalog import ToolCatalog, catalog_from_settings
from .clock import SYSTEM, Clock
from .config import Settings
from .helper import SkillHelper
from .llm import LLMClient, llm_client
from .service import SkillService

DATA_DIR = Path(__file__).resolve().parent.parent / 'data'


@dataclass
class Services:
    service: SkillService
    helper: SkillHelper
    catalog: ToolCatalog
    store: object
    registry: object

    async def aclose(self):
        close = getattr(self.registry, 'aclose', None)
        if close:
            await close()


def build_services(cfg: Settings, *, store=None, registry=None, catalog: ToolCatalog | None = None,
                   llm: LLMClient | None = None, clock: Clock | None = None) -> Services:
    clock = clock or SYSTEM  # the one clock every part reads (#535)
    if store is None:
        from .store import FirestoreStore
        store = FirestoreStore(cfg.firestore_project_id, cfg.publish_operation_retention_days, clock=clock)
    else:
        store.clock = clock  # a store passed in writes its timestamps from the same clock
    if registry is None:
        from .registry import RegistryClient
        registry = RegistryClient(cfg)
    if catalog is None:
        catalog = catalog_from_settings(cfg, DATA_DIR, clock)
    return Services(
        service=SkillService(store, registry, catalog, cfg, clock),
        helper=SkillHelper(cfg, catalog, store, llm if llm is not None else llm_client(cfg), clock),
        catalog=catalog, store=store, registry=registry,
    )
