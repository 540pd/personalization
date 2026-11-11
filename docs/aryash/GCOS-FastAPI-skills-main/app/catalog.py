"""Static approved catalog gate. Runtime authorizations are checked again by ADK tools."""
import json
from pathlib import Path
from .models import ToolValidationResponse, ToolResult


class ToolCatalog:
    def __init__(self, path: str | Path):
        obj = json.loads(Path(path).read_text(encoding='utf-8'))
        self.entries = {item['name']: item for item in obj['tools']}

    def validate(self, names: list[str]) -> ToolValidationResponse:
        results = []
        seen = set()
        for name in names:
            entry = self.entries.get(name)
            if name in seen:
                results.append(ToolResult(name=name, approved=False, reason='duplicate'))
            elif not entry or not entry.get('approved', False):
                results.append(ToolResult(name=name, approved=False, reason='not in approved tool catalog'))
            else:
                results.append(ToolResult(name=name, approved=True, reason='approved by catalog'))
            seen.add(name)
        return ToolValidationResponse(valid=all(item.approved for item in results), results=results)
