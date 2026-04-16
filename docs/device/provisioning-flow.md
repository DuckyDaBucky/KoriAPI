# Provisioning Flow

## Admin side
- Call `POST /v1/admin/provisioning-codes` with admin credentials.
- Required body:

```json
{
  "workspaceId": "ws_dev",
  "userId": "user_dev",
  "expiresInSec": 600,
  "label": "esp32-lab-bench"
}
```

- Response:

```json
{
  "code": "kori_prov_xxx",
  "workspaceId": "ws_dev",
  "userId": "user_dev",
  "expiresAt": "2026-04-16T18:00:00.000Z",
  "label": "esp32-lab-bench"
}
```

## Device side
- Use the code exactly once during bootstrap.
- Treat provisioning codes as short-lived secrets.
- Never log the code after a successful bootstrap.

## Failure handling
- `401 INVALID_DEVICE_BOOTSTRAP_CREDENTIAL`: provisioning code was invalid, expired, or already consumed.
- Re-request a fresh provisioning code instead of retrying the same expired code indefinitely.
