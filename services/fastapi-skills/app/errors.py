"""One error shape, request IDs and redacted JSON logs (#512).

Every error answers the contracts §5 shape:

    {"error": {"code", "message", "requestId", "retryable", "issues"?}}

Code raises plain HTTPException with a fixed message (or a structured dict for
validation details); `classify` turns that into a stable code. Messages are
the service's own fixed text: never Markdown, prompts, tokens, owner keys or a
provider's raw error. Every log line is JSON and carries the request ID."""
import contextvars
import hashlib
import json
import logging
import re
import sys
import time
import uuid
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

REQUEST_ID_HEADER = 'X-Request-Id'
SAFE_REQUEST_ID = re.compile(r'[A-Za-z0-9._:-]{8,128}')
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar('request_id', default='-')

# Codes from contracts §5, plus the few it has no row for (marked *).
UNAUTHENTICATED = 'unauthenticated'
FORBIDDEN = 'forbidden'
NOT_ACCESSIBLE = 'resource_not_accessible'
VALIDATION = 'validation_failed'
TOOL_NOT_APPROVED = 'tool_not_approved'
IDEMPOTENCY = 'idempotency_conflict'
DEPENDENCY = 'dependency_unavailable'
CONFLICT = 'conflict'                        # * another state conflict
PUBLISH_IN_PROGRESS = 'publish_in_progress'  # * the Skill's publish lock is held
QUOTA = 'quota_exceeded'                     # * five Skills / 300 KiB
RATE_LIMITED = 'rate_limited'                # * draft helper per-hour limit
INTERNAL = 'internal_error'                  # * an unexpected failure

# Messages whose code isn't the default for their status.
BY_MESSAGE = {
    'Idempotency key reused with changed content': IDEMPOTENCY,
    'Idempotency mismatch': IDEMPOTENCY,
    'Another publish is already in progress': PUBLISH_IN_PROGRESS,
    'Publish already active': PUBLISH_IN_PROGRESS,
    'A publish is currently in progress': PUBLISH_IN_PROGRESS,
    'Maximum five Skills per user': QUOTA,
    '300 KiB combined user Skills limit exceeded': QUOTA,
    'Combined Skills budget exceeded': QUOTA,
    'Unapproved tool names provided': TOOL_NOT_APPROVED,
}
BY_STATUS = {
    401: UNAUTHENTICATED, 403: FORBIDDEN, 404: NOT_ACCESSIBLE, 409: CONFLICT,
    413: VALIDATION, 422: VALIDATION, 429: RATE_LIMITED,
    502: DEPENDENCY, 503: DEPENDENCY, 504: DEPENDENCY,
}
RETRYABLE = {DEPENDENCY, RATE_LIMITED, PUBLISH_IN_PROGRESS}
GENERIC = {
    VALIDATION: 'The request is not valid', TOOL_NOT_APPROVED: 'A tool is not in the approved tool catalog',
    INTERNAL: 'Something went wrong. Try again.',
}


def _code_for(status: int) -> str:
    return BY_STATUS.get(status, INTERNAL if status >= 500 else VALIDATION if status >= 400 else INTERNAL)


def classify(status: int, detail) -> tuple[str, str, list | None, dict]:
    """(code, message, issues, extra fields) for an HTTPException."""
    if isinstance(detail, dict):
        if 'invalid_tools' in detail:
            issues = [{'code': TOOL_NOT_APPROVED, 'path': 'tool_names', 'tool': name,
                       'message': f'{name} is not in the approved tool catalog'} for name in detail['invalid_tools']]
            extra = {'catalogRevision': detail['catalog_revision']} if detail.get('catalog_revision') else {}
            return TOOL_NOT_APPROVED, GENERIC[TOOL_NOT_APPROVED], issues, extra
        if 'tools_not_listed' in detail:
            issues = [{'code': 'tool_not_listed', 'path': 'tool_names', 'tool': name,
                       'message': f'SKILL.md declares {name}; list it in tool_names'} for name in detail['tools_not_listed']]
            return VALIDATION, 'SKILL.md declares tools that tool_names does not list', issues, {}
        if 'tool_declaration_errors' in detail:
            issues = [{'code': 'tool_declaration', 'path': e['path'], 'message': e['message']} for e in detail['tool_declaration_errors']]
            return VALIDATION, 'The tools SKILL.md declares need fixing', issues, {}
        code = _code_for(status)
        return code, GENERIC.get(code, 'The request could not be completed'), None, {}
    message = detail if isinstance(detail, str) and detail else GENERIC.get(_code_for(status), 'The request could not be completed')
    return BY_MESSAGE.get(message, _code_for(status)), message, None, {}


def error_body(code: str, message: str, issues: list | None = None, extra: dict | None = None) -> dict:
    error = {'code': code, 'message': message, 'requestId': request_id_var.get(), 'retryable': code in RETRYABLE}
    if issues:
        error['issues'] = issues
    error.update(extra or {})
    return {'error': error}


def owner_hash(owner_key: str | None) -> str | None:
    """A stable, non-reversible handle for an owner in logs: never the key."""
    return hashlib.sha256(owner_key.encode()).hexdigest()[:16] if owner_key else None


class JsonFormatter(logging.Formatter):
    """One JSON object per line, in Cloud Logging's field names."""
    def format(self, record: logging.LogRecord) -> str:
        line = {'severity': record.levelname, 'message': record.getMessage(), 'logger': record.name,
                'requestId': getattr(record, 'requestId', request_id_var.get())}
        line.update(getattr(record, 'fields', {}))
        return json.dumps(line, separators=(',', ':'))


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.requestId = request_id_var.get()
        return True


log = logging.getLogger('gcos.fastapi')


def configure_logging():
    if getattr(log, '_gcos_configured', False):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdFilter())
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False
    log._gcos_configured = True


def install(app: FastAPI):
    configure_logging()

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        code, message, issues, extra = classify(exc.status_code, exc.detail)
        request.state.error_code = code
        headers = {k: v for k, v in (exc.headers or {}).items()}
        return JSONResponse(error_body(code, message, issues, extra), status_code=exc.status_code, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        # Location and message only: pydantic's `input` would echo the body (Markdown, prompts).
        issues = [{'code': err.get('type', 'invalid'), 'path': '.'.join(str(p) for p in err.get('loc', ())),
                   'message': err.get('msg', 'Invalid value')} for err in exc.errors()]
        request.state.error_code = VALIDATION
        return JSONResponse(error_body(VALIDATION, GENERIC[VALIDATION], issues), status_code=422)

    @app.middleware('http')
    async def request_context(request: Request, call_next):
        incoming = request.headers.get(REQUEST_ID_HEADER, '')
        request_id = incoming if SAFE_REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            try:
                response = await call_next(request)
            except Exception as exc:  # noqa: BLE001: the shape holds for unexpected failures too
                log.error('unhandled error', extra={'fields': {'errorType': type(exc).__name__}})
                request.state.error_code = INTERNAL
                response = JSONResponse(error_body(INTERNAL, GENERIC[INTERNAL]), status_code=500)
            response.headers[REQUEST_ID_HEADER] = request_id
            route = request.scope.get('route')
            fields = {
                'method': request.method, 'route': getattr(route, 'path', 'unmatched'),
                'status': response.status_code, 'latencyMs': round((time.perf_counter() - started) * 1000, 1),
                'ownerHash': owner_hash(request.headers.get('X-Owner-Key')),
            }
            if getattr(request.state, 'error_code', None):
                fields['errorCode'] = request.state.error_code
            log.info('request', extra={'fields': fields})
            return response
        finally:
            request_id_var.reset(token)

