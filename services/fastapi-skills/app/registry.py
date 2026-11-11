"""Agent Registry v1alpha REST adapter with long-running operations."""
import asyncio
import base64
import uuid
from typing import Any
import httpx
from fastapi import HTTPException
from .config import Settings


class RegistryError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(message)


class RegistryClient:
    def __init__(self, config: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.config = config
        self.http = httpx.AsyncClient(timeout=25, transport=transport)

    async def aclose(self):
        await self.http.aclose()

    async def _access_token(self) -> str:
        def issue():
            import google.auth
            from google.auth.transport.requests import Request
            creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
            creds.refresh(Request())
            return creds.token
        return await asyncio.to_thread(issue)

    async def call(self, method: str, name: str, *, params: dict | None = None, json: dict | None = None) -> dict:
        root = self.config.registry_base_url.rstrip('/')
        version = self.config.registry_api_version
        if not name.startswith('projects/'):
            raise ValueError('Registry path must be fully qualified')
        try:
            response = await self.http.request(
                method, f'{root}/{version}/{name}',
                params=params, json=json,
                headers={'Authorization': f'Bearer {await self._access_token()}'},
            )
        except httpx.TimeoutException as exc:
            raise RegistryError(503, 'Registry timeout') from exc
        except httpx.RequestError as exc:
            raise RegistryError(503, 'Registry unavailable') from exc
        if response.status_code >= 400:
            # Do not expose full raw Google errors to browsers; callers see status only.
            raise RegistryError(response.status_code, f'Agent Registry returned HTTP {response.status_code}')
        return response.json() if response.content else {}

    async def create_container(self, parent: str, registry_id: str, title: str, description: str, request_id: str):
        return await self.call('POST', f'{parent}/skills', params={'skillId': registry_id, 'requestId': request_id},
                               json={'displayName': title, 'description': description, 'type': 'SIMPLE', 'targetState': 'TARGET_STATE_DRAFT'})

    async def get_skill(self, resource: str):
        return await self.call('GET', resource)

    async def get_revision(self, resource: str):
        return await self.call('GET', resource)

    async def list_revisions(self, skill_resource: str):
        return await self.call('GET', f'{skill_resource}/revisions')

    async def download_revision(self, revision_resource: str) -> bytes:
        """Read ZIP only from Registry; follow signed storage redirects without forwarding bearer token."""
        from urllib.parse import urlparse
        rev = await self.get_revision(revision_resource)
        if rev.get('state') not in ('ACTIVE', 'STATE_ACTIVE'):
            raise RegistryError(409, 'Only ACTIVE revisions can be downloaded')
        root = self.config.registry_base_url.rstrip('/')
        url = f'{root}/{self.config.registry_api_version}/{revision_resource}?alt=media'
        auth_header = {'Authorization': f'Bearer {await self._access_token()}'}
        for _ in range(4):
            try:
                result = await self.http.get(url, headers=auth_header, follow_redirects=False)
            except httpx.RequestError as exc:
                raise RegistryError(503, 'Registry download unavailable') from exc
            if result.status_code in (301, 302, 303, 307, 308):
                location = result.headers.get('location', '')
                host = (urlparse(location).hostname or '').lower()
                if not location.startswith('https://') or not (
                    host in ('storage.googleapis.com', 'agentregistry.googleapis.com')
                    or host.endswith('.storage.googleapis.com')
                    or host.endswith('.googleusercontent.com')
                ):
                    raise RegistryError(502, 'Unexpected Registry download redirect')
                url = location
                # Never forward the Registry OAuth token to a different host.
                auth_header = {'Authorization': f'Bearer {await self._access_token()}'} if host == 'agentregistry.googleapis.com' else {}
                continue
            if result.status_code >= 400:
                raise RegistryError(result.status_code, 'Registry revision download failed')
            if len(result.content) > 1024 * 1024:
                raise RegistryError(413, 'Registry revision ZIP exceeded download limit')
            return result.content
        raise RegistryError(502, 'Too many Registry download redirects')

    async def create_revision(self, parent: str, revision_id: str, archive: bytes, request_id: str):
        return await self.call('POST', f'{parent}/revisions',
                               params={'skillRevisionId': revision_id, 'requestId': request_id},
                               json={'archiveUploadSource': {'archiveContent': base64.b64encode(archive).decode('ascii')}})

    async def patch_skill(self, resource: str, fields: dict, request_id: str):
        payload = {'name': resource, **fields}
        return await self.call('PATCH', resource, params={'updateMask': ','.join(fields), 'requestId': request_id}, json=payload)

    async def operation(self, operation_name: str):
        return await self.call('GET', operation_name)


def operation_uuid(value: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'gcos-agentregistry:' + value))


def operation_done(obj: dict) -> bool:
    if 'error' in obj:
        raise RegistryError(502, 'Registry operation failed; inspect Registry console/logs')
    return bool(obj.get('done'))


def explain_registry_error(error: RegistryError):
    code = error.status
    # Fixed messages only (#512): the status survives, the Registry's text doesn't.
    if code in (404, 403):
        # Never transform permissions failures into successful reads.
        raise HTTPException(code, detail='Skill unavailable' if code == 404 else 'Agent Registry denied access')
    if code == 409:
        raise HTTPException(409, detail='Agent Registry resource conflict')
    raise HTTPException(502 if code < 500 else 503, detail='Agent Registry is unavailable. Try again shortly.')
