# Kori Device API Overview

The ESP32 integrates with KoriAPI through one REST bootstrap flow and one long-lived WebSocket.

Core sequence:
- An admin creates a provisioning code in the dashboard or via `POST /v1/admin/provisioning-codes`.
- The device calls `POST /v1/device/bootstrap` with `hardwareId`, `deviceName`, `firmwareVersion`, and either `provisioningCode` or the legacy `userApiKey`.
- The API returns `deviceId`, `deviceToken`, `config`, `wsUrl`, `serverTime`, and `protocolVersion`.
- The device opens `wsUrl` with `Authorization: Bearer <deviceToken>` or sends the token in `device:hello`.
- The API responds with `session:ready` and `time:sync`, then accepts telemetry and health events.

Protocol goals:
- Device-facing flows never expose user profile data or third-party integration secrets.
- Tokens are opaque and server-authoritative.
- Time sync is server-driven so the device can correct drift.
- The dashboard and admin APIs consume the same sanitized live state that devices produce.
