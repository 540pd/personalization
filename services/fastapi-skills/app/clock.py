"""The service's one clock (#535). Everything that reads the time takes a
Clock, built once in wiring.build_services, so a test that moves the clock
moves it everywhere: deadlines, rate windows, the catalog cache and the
timestamps written to records. No other module reads the time itself."""
import time
from datetime import datetime, timedelta, timezone


class Clock:
    def time(self) -> float:
        """Wall-clock seconds since the epoch: what timestamps and deadlines use."""
        return time.time()

    def monotonic(self) -> float:
        """Seconds that only go forward: for caches and intervals."""
        return time.monotonic()

    def now(self) -> datetime:
        return datetime.fromtimestamp(self.time(), timezone.utc)

    def stamp(self) -> str:
        """A record timestamp (ISO 8601, UTC)."""
        return self.now().isoformat()

    def expire_at(self, days: int) -> datetime:
        """When a finished record may be deleted (#508); only a TTL policy reads it."""
        return self.now() + timedelta(days=days)


SYSTEM = Clock()


class FakeClock(Clock):
    """For tests: starts at `start`, and moves only when advanced (both readings together)."""
    def __init__(self, start: float = 1_800_000_000.0):
        self._wall = start
        self._mono = 0.0

    def time(self) -> float:
        return self._wall

    def monotonic(self) -> float:
        return self._mono

    def advance(self, seconds: float):
        self._wall += seconds
        self._mono += seconds
