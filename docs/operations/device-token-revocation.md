# Device Token Revocation

Use this runbook when a device must be forcibly disconnected or reprovisioned.

## Immediate actions

1. Call `POST /v1/admin/devices/:id/revoke` from the dashboard or API.
2. Confirm the device no longer appears as connected in `/v1/admin/devices`.
3. Check `/v1/admin/audit` for `device.revoke`.

## Reprovision flow

1. If the device should remain in service, call `POST /v1/admin/devices/:id/reprovision`.
2. Deliver the rotated token to the secure provisioning channel or use a fresh provisioning code.
3. Confirm the device reconnects with the new token and receives `time:sync`.

## Follow-up

1. Review recent telemetry and notifications for suspicious activity.
2. Revoke any related user API key fallback if it was used during bootstrap.
3. Record the incident in the operational log.
