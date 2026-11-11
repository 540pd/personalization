"""Deterministic registry ZIP, with SKILL.md only. No executable scripts accepted."""
import hashlib
import io
import re
import zipfile
import yaml
from fastapi import HTTPException

FRONTMATTER_RE = re.compile(r'\A---\s*\n(.*?)\n---\s*\n(.*)\Z', re.DOTALL)


def validate_markdown(raw: str) -> str:
    text = raw.strip() + '\n'
    if len(text.encode('utf-8')) > 100 * 1024:
        raise HTTPException(422, detail='SKILL.md exceeds GCOS limit of 100 KiB')
    match = FRONTMATTER_RE.fullmatch(text)
    if not match:
        raise HTTPException(422, detail='SKILL.md needs YAML frontmatter with name and description')
    try:
        header = yaml.safe_load(match.group(1))
    except yaml.YAMLError:
        raise HTTPException(422, detail='Invalid YAML frontmatter') from None
    if not isinstance(header, dict) or not isinstance(header.get('name'), str) or not isinstance(header.get('description'), str):
        raise HTTPException(422, detail='Frontmatter must contain name and description')
    if not re.fullmatch(r'[a-z][a-z0-9-]{2,50}[a-z0-9]', header['name']):
        raise HTTPException(422, detail='Invalid skill frontmatter name')
    if not (10 <= len(header['description']) <= 500) or not match.group(2).strip():
        raise HTTPException(422, detail='Missing useful description or instructions')
    return text


def build_zip(markdown: str) -> tuple[bytes, str]:
    text = validate_markdown(markdown)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as zf:
        entry = zipfile.ZipInfo('SKILL.md', date_time=(1980, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        zf.writestr(entry, text.encode('utf-8'))
    payload = buffer.getvalue()
    if len(payload) > 500 * 1024:
        raise HTTPException(422, detail='Compressed package exceeds conservative 500 KiB limit')
    return payload, hashlib.sha256(payload).hexdigest()
