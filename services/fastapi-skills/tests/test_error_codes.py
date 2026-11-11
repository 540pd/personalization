"""Every error is raised with its code (#531): no HTTPException is built in
app/ outside errors.py, every ServiceError names a code from app/codes.py,
and the codes the service is known for come from the raise."""
import ast
from pathlib import Path
import pytest
from app import codes
from app.errors import ServiceError
from app.models import PublishRequest, SkillCreate

APP = Path(__file__).resolve().parent.parent / 'app'
KNOWN = {v for k, v in vars(codes).items() if k.isupper() and isinstance(v, str)}


def calls(name):
    for path in sorted(APP.glob('*.py')):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Call) and getattr(node.func, 'id', getattr(node.func, 'attr', None)) == name:
                yield path.name, node


def test_no_bare_http_exception_outside_errors_py():
    bare = [(f, n.lineno) for f, n in calls('HTTPException') if f != 'errors.py']
    assert bare == []


def test_every_raise_names_a_known_code():
    for f, node in [*calls('ServiceError'), *calls('Refused')]:
        if f == 'errors.py' or len(node.args) < 2:
            continue
        code = node.args[1]
        if isinstance(code, ast.Attribute) and isinstance(code.value, ast.Name) and code.value.id == 'codes':
            assert getattr(codes, code.attr) in KNOWN, (f, node.lineno)
        elif isinstance(code, ast.Attribute) and code.attr == 'code' and f == 'store.py':
            continue  # forwards a rule's Refused.code, itself checked here
        elif isinstance(code, ast.IfExp):  # the Registry's 404 / 403
            assert all(getattr(codes, b.attr) in KNOWN for b in (code.body, code.orelse)), (f, node.lineno)
        else:
            pytest.fail(f'{f}:{node.lineno} raises without a codes.* code')


async def code_of(call):
    with pytest.raises(ServiceError) as failure:
        await call
    return failure.value.code


async def test_the_service_raises_its_codes(base):
    svc, *_ = base
    for i in range(5):
        await svc.create('usr_A', SkillCreate(slug=f'skill-{i:02d}', display_name='Brand Tone', description='Applies the brand voice.'))
    assert await code_of(svc.create('usr_A', SkillCreate(slug='skill-05', display_name='Brand Tone', description='Applies the brand voice.'))) == codes.QUOTA
    sid = svc.list_owned('usr_A')[0]['skillId']
    from support import MD
    await svc.publish('usr_A', sid, PublishRequest(markdown=MD), 'key-12345678')
    assert await code_of(svc.publish('usr_A', sid, PublishRequest(markdown=MD + '\nMore\n'), 'key-12345678')) == codes.IDEMPOTENCY
    assert await code_of(svc.publish('usr_A', sid, PublishRequest(markdown=MD, tool_names=['shell.exec']), 'key-other-1')) == codes.TOOL_NOT_APPROVED
    assert await code_of(svc.read('usr_B', sid)) == codes.NOT_ACCESSIBLE
