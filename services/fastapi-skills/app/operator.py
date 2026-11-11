"""Operator recovery for stuck publish operations (#508). There is no HTTP
route: this runs as a CLI with the operator's own Application Default
Credentials, and refuses the Node service account. Every action, including a
refused or no-op one, leaves an audit record (no owner key, no SKILL.md).

    python -m app.operator reconcile <operation_id> --operator you@example.com --reason "..."
    python -m app.operator fail <operation_id> --operator you@example.com --reason "..." [--force]
"""
import argparse
import asyncio
import sys
from . import codes
from .errors import ServiceError
from .publish_op import PublishOp, State

OPERATOR_FAILED = 'Failed by an operator'


def _audit(svc, action: str, op: PublishOp, operator: str, reason: str, before: str, after: str, outcome: str, force: bool = False):
    svc.store.record_audit({
        'action': action, 'operationId': op.operation_id, 'skillId': op.skill_id,
        'operator': operator, 'reason': reason, 'force': force,
        'statusBefore': before, 'statusAfter': after, 'outcome': outcome, 'at': svc.clock.stamp(),
    })


def _load(svc, op_id: str) -> PublishOp:
    row = svc.store.get_operation(op_id)
    if not row:
        raise ServiceError(404, codes.NOT_ACCESSIBLE, 'Publish operation not found')
    return PublishOp.from_row(row)  # a frozen copy: the store may hand back its live row


async def reconcile(svc, op_id: str, operator: str, reason: str) -> dict:
    """Recover: advance the operation from the Registry's state, as a poll would
    (including timing it out if it never reached the Registry)."""
    before = _load(svc, op_id)
    status = await svc.advance_operation(op_id)
    outcome = 'changed' if status.status != before.status else 'no_change'
    _audit(svc, 'reconcile', before, operator, reason, before.status, status.status, outcome)
    return {'outcome': outcome, 'status': status.status}


async def fail(svc, op_id: str, operator: str, reason: str, force: bool = False) -> dict:
    """Release: fail the operation, freeing the Skill's publish lock and its
    reserved bytes. Refused, unless forced, once the revision is in the
    Registry: it may still become the default, so reconcile it instead."""
    op = _load(svc, op_id)
    before = op.status
    if op.finished:
        _audit(svc, 'fail', op, operator, reason, before, before, 'no_change', force)
        return {'outcome': 'no_change', 'status': before}
    reached_registry = before == State.PENDING_ACTIVATION or bool(op.registry_operation or op.promotion_operation)
    if reached_registry and not force:
        _audit(svc, 'fail', op, operator, reason, before, before, 'refused', force)
        return {'outcome': 'refused', 'status': before,
                'message': 'The revision reached the Registry; reconcile it, or pass --force'}
    changed = svc.store.fail_operation(op.to_row(), OPERATOR_FAILED)
    after = _load(svc, op_id).status
    outcome = 'changed' if changed else 'no_change'
    _audit(svc, 'fail', op, operator, reason, before, after, outcome, force)
    return {'outcome': outcome, 'status': after}


def adc_account() -> str | None:
    """The service account behind ADC, if it is one (user credentials have none)."""
    import google.auth
    creds, _ = google.auth.default()
    return getattr(creds, 'service_account_email', None)


def refuse_node_account(account: str | None, node_account: str):
    if node_account and account and account.lower() == node_account.lower():
        raise SystemExit('Refusing to run as the Node service account; use an operator account')


async def _run(args) -> dict:
    from .config import settings
    from .wiring import build_services
    cfg = settings()
    refuse_node_account(adc_account(), cfg.node_service_account)
    parts = build_services(cfg)
    try:
        if args.action == 'reconcile':
            return await reconcile(parts.service, args.operation_id, args.operator, args.reason)
        return await fail(parts.service, args.operation_id, args.operator, args.reason, args.force)
    finally:
        await parts.aclose()


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m app.operator', description='Recover a stuck publish operation')
    parser.add_argument('action', choices=['reconcile', 'fail'])
    parser.add_argument('operation_id')
    parser.add_argument('--operator', required=True, help='who is acting, for the audit record')
    parser.add_argument('--reason', required=True, help='why, for the audit record')
    parser.add_argument('--force', action='store_true', help='fail even though the revision reached the Registry')
    args = parser.parse_args(argv)
    result = asyncio.run(_run(args))
    print(result)
    return 0 if result['outcome'] != 'refused' else 1


if __name__ == '__main__':
    sys.exit(main())
