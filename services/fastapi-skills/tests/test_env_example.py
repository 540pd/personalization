""".env.example lists every setting app/config.py reads (#515), so it can't drift."""
import re
from pathlib import Path
from app.config import Settings


def test_env_example_lists_every_setting():
    root = Path(__file__).resolve().parent.parent
    listed = {m.group(1) for m in re.finditer(r'^([A-Z][A-Z0-9_]*)=', (root / '.env.example').read_text(), re.M)}
    expected = {name.upper() for name in Settings.model_fields}
    assert listed == expected, f'missing: {sorted(expected - listed)}, extra: {sorted(listed - expected)}'
