"""One clock (#535): every part reads the time from the Clock wiring gives it,
so moving a FakeClock moves deadlines, rate windows, the catalog cache and the
timestamps written to records together."""
import ast
from datetime import timedelta
from pathlib import Path
from app.clock import Clock, FakeClock
from app.models import PublishRequest, SkillCreate
from support import MD, make_parts, make_settings

APP = Path(__file__).resolve().parent.parent / 'app'


def test_no_module_reads_the_time_but_clock_py():
    reads = []
    for path in sorted(APP.glob('*.py')):
        if path.name == 'clock.py':
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                if (node.value.id, node.attr) in {('time', 'time'), ('time', 'monotonic'), ('datetime', 'now'), ('datetime', 'utcnow')}:
                    reads.append(f'{path.name}:{node.lineno}')
    assert reads == []


def test_the_system_clock_reads_real_time():
    clock = Clock()
    assert abs(clock.now().timestamp() - clock.time()) < 1
    assert clock.expire_at(30) - clock.now() > timedelta(days=29)


def test_fake_clock_moves_both_readings():
    clock = FakeClock(start=1000.0)
    clock.advance(5)
    assert (clock.time(), clock.monotonic()) == (1005.0, 5.0)
    assert clock.stamp().startswith('1970-01-01T00:16:45')


async def test_records_are_stamped_from_the_one_clock(clock):
    parts = make_parts(clock=clock)
    svc = parts.service
    skill = await svc.create('usr_A', SkillCreate(slug='brand-tone', display_name='Brand Tone', description='Applies the brand voice.'))
    assert parts.store.get_skill(skill['skillId'])['createdAt'] == clock.stamp()
    result = await svc.publish('usr_A', skill['skillId'], PublishRequest(markdown=MD), 'key-12345678')
    clock.advance(10)
    await svc.publish_status('usr_A', skill['skillId'], result.operation_id)
    op = parts.store.get_operation(result.operation_id)
    assert op['expireAt'] == clock.expire_at(make_settings().publish_operation_retention_days)
    assert parts.store.get_skill(skill['skillId'])['updatedAt'] == clock.stamp()


def test_the_catalog_cache_follows_the_one_clock(clock, monkeypatch):
    parts = make_parts(make_settings(catalog_cache_seconds=60), clock=clock)
    loads = []
    real = parts.catalog.provider.load
    monkeypatch.setattr(parts.catalog.provider, 'load', lambda: loads.append(1) or real())
    parts.catalog.validate(['brand.read'])
    clock.advance(59)
    parts.catalog.validate(['brand.read'])
    assert loads == []  # still the snapshot read at startup
    clock.advance(1)
    parts.catalog.validate(['brand.read'])
    assert loads == [1]
