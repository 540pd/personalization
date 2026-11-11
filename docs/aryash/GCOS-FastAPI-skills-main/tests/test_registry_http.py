import asyncio
import base64
import io
import zipfile
import httpx
import pytest
from app.registry import RegistryClient
from app.config import Settings


@pytest.mark.asyncio
async def test_real_rest_contract_shape_using_mock_transport():
    captured = []

    def handler(request: httpx.Request):
        captured.append(request)
        if request.method == 'POST' and request.url.path.endswith('/revisions'):
            body = __import__('json').loads(request.content)
            archive = base64.b64decode(body['archiveUploadSource']['archiveContent'])
            with zipfile.ZipFile(io.BytesIO(archive)) as z:
                assert z.namelist() == ['SKILL.md']
            return httpx.Response(200, json={'name': 'projects/test-project/locations/us/operations/op1', 'done': False})
        return httpx.Response(200, json={'name': 'projects/test-project/locations/us/skills/private-test'})

    c = RegistryClient(Settings(), transport=httpx.MockTransport(handler))

    async def fake_token():
        return 'unit-test-token'

    c._access_token = fake_token
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('SKILL.md', '---\nname: demo\ndescription: demo details\n---\n# Demo\n')
    result = await c.create_revision('projects/test-project/locations/us/skills/private-test', 'r-1234', buf.getvalue(), 'abcd')
    assert result['done'] is False
    assert captured[-1].url.path == '/v1alpha/projects/test-project/locations/us/skills/private-test/revisions'
    assert captured[-1].url.params['skillRevisionId'] == 'r-1234'
    await c.aclose()
