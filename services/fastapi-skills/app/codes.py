"""Error codes (#512, #531): contracts §5, plus the few it has no row for
(marked *). Plain strings in a module of their own, so the rules can name
a code without importing anything HTTP."""
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

RETRYABLE = frozenset({DEPENDENCY, RATE_LIMITED, PUBLISH_IN_PROGRESS})
