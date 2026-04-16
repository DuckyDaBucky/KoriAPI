# Retry and Backoff

Bootstrap:
- Retry network errors with exponential backoff: `1s`, `2s`, `4s`, `8s`, capped at `60s`.
- Do not retry `401 INVALID_DEVICE_BOOTSTRAP_CREDENTIAL` without operator intervention.

WebSocket reconnect:
- Retry on transport loss with jittered exponential backoff.
- Suggested sequence: `1s`, `2s`, `5s`, `10s`, `20s`, `30s`, cap at `60s`.

Telemetry send loop:
- Buffer the most recent unsent reading if the socket is unavailable.
- Prefer dropping stale high-frequency samples over replaying an unbounded backlog.
