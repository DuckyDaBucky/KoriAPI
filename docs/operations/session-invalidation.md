# Session Invalidation

Use this runbook when a user loses access, resets credentials, or needs emergency session revocation.

## Trigger conditions

- password reset completed
- role downgrade or workspace removal
- MFA factor reset after compromise
- suspicious dashboard activity

## Actions

1. Invalidate the user sessions through the auth surface or direct admin tooling.
2. Confirm subsequent `/v1/auth/session` requests fail for the revoked token.
3. Check the dashboard cookies are cleared on next logout or redirect cycle.
4. Verify `/v1/admin/audit` includes the invalidation reason.

## Staging validation

1. Sign in as the affected user.
2. Trigger the invalidation event.
3. Reload any dashboard page and confirm it redirects to `/login`.
