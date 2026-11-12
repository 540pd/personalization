"""Node-to-FastAPI identity. Owner key is only accepted from a verified Node workload."""
import asyncio
import os
import re
from dataclasses import dataclass
from fastapi import Header, HTTPException, status
from .config import settings


# The form Node's client sends (backend/src/lib/fastapi/client.ts): `usr_` and
# 1–124 URL-safe characters. The key becomes part of Firestore document IDs,
# so nothing else, a `/` least of all, may pass (#513).
OWNER_KEY = re.compile(r'usr_[A-Za-z0-9_-]{1,124}')


@dataclass(frozen=True)
class Principal:
    owner_key: str
    caller_email: str


async def trusted_node(
    authorization: str | None = Header(default=None),
    x_owner_key: str | None = Header(default=None),
) -> Principal:
    cfg = settings()
    if not x_owner_key or not OWNER_KEY.fullmatch(x_owner_key):
        raise HTTPException(401, detail='Missing or invalid owner context')
    if cfg.dev_bypass_auth and not os.environ.get('K_SERVICE'):
        return Principal(owner_key=x_owner_key, caller_email='local-test-node')
    if not cfg.fastapi_audience or not cfg.node_service_account:
        raise HTTPException(503, detail='Service authentication is not configured')
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail='Missing service ID token')
    token = authorization[7:]

    def verify():
        from google.oauth2 import id_token
        from google.auth.transport.requests import Request
        return id_token.verify_token(token, Request(), audience=cfg.fastapi_audience)

    try:
        claims = await asyncio.to_thread(verify)
    except Exception:
        raise HTTPException(401, detail='Invalid service token') from None
    if claims.get('iss') not in ('https://accounts.google.com', 'accounts.google.com'):
        raise HTTPException(403, detail='Unexpected token issuer')
    if claims.get('email') != cfg.node_service_account or claims.get('email_verified') is not True:
        raise HTTPException(403, detail='Caller service not allowed')
    return Principal(owner_key=x_owner_key, caller_email=claims['email'])
