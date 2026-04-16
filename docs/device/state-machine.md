# Device State Machine

States:
- `UNPROVISIONED`
- `BOOTSTRAPPING`
- `TOKEN_READY`
- `WS_CONNECTING`
- `SESSION_READY`
- `STREAMING`
- `DEGRADED`
- `REPROVISION_REQUIRED`

Transitions:
- `UNPROVISIONED -> BOOTSTRAPPING` when a provisioning code is entered.
- `BOOTSTRAPPING -> TOKEN_READY` on successful bootstrap response.
- `TOKEN_READY -> WS_CONNECTING` when opening `/v1/ws/device`.
- `WS_CONNECTING -> SESSION_READY` after `session:ready`.
- `SESSION_READY -> STREAMING` after first successful telemetry cycle.
- `STREAMING -> DEGRADED` on repeated transient transport failures.
- `ANY -> REPROVISION_REQUIRED` after unauthorized token failures that persist after rotation logic.
