# Error Codes

REST:
- `401 INVALID_DEVICE_BOOTSTRAP_CREDENTIAL`: invalid `provisioningCode` or legacy `userApiKey`
- `401 MISSING_DEVICE_TOKEN`: device token missing on protected route
- `401 INVALID_DEVICE_TOKEN`: token invalid, revoked, or expired

WebSocket close codes:
- `4001 unauthorized`: token missing, invalid, expired, or device ID mismatch
- `1003 bad payload`: payload failed schema validation or parsing

Device behavior:
- On `4001`, wipe the stored token and trigger reprovisioning if a token refresh does not fix the issue.
- On `1003`, keep the token but inspect payload formatting and firmware serialization.
