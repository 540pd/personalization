"""What the service's parts share (#530): one set of dependencies, and the
ownership check every Skill operation starts with."""
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Callable
from .catalog import ToolCatalog
from .config import Settings
from . import codes
from .errors import ServiceError


def digest(data) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


@dataclass
class Deps:
    store: object
    registry: object
    catalog: ToolCatalog
    cfg: Settings
    clock: Callable[[], float] = field(default=time.time)


class Part:
    """A piece of the service working on the shared Deps. Swapping a dependency
    on the Deps (as SkillService's setters do) reaches every part at once."""
    def __init__(self, deps: Deps):
        self.deps = deps

    @property
    def store(self):
        return self.deps.store

    @property
    def registry(self):
        return self.deps.registry

    @property
    def catalog(self) -> ToolCatalog:
        return self.deps.catalog

    @property
    def cfg(self) -> Settings:
        return self.deps.cfg

    @property
    def clock(self):
        return self.deps.clock

    def owned(self, owner: str, skill_id: str) -> dict:
        row = self.store.get_skill(skill_id)
        if not row or row['ownerKey'] != owner:
            raise ServiceError(404, codes.NOT_ACCESSIBLE, 'Skill not found')
        return row
