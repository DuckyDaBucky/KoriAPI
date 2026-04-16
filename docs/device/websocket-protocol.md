# WebSocket Protocol

Endpoint:
- `/v1/ws/device`

Authentication:
- Preferred: `Authorization: Bearer <deviceToken>`
- Also supported in `device:hello.payload.token`

Connection startup:
1. Open the WebSocket.
2. Send `device:hello`.
3. Wait for `session:ready`.
4. Apply `time:sync`.

Example hello envelope:

```json
{
  "type": "device:hello",
  "ts": 1776352044,
  "payload": {
    "deviceId": "dev_123",
    "token": "opaque-token",
    "firmwareVersion": "0.3.0",
    "hardwareId": "AA:BB:CC:DD:EE:FF"
  }
}
```

Server startup envelopes:

```json
{
  "type": "session:ready",
  "ts": 1776352044,
  "payload": {
    "deviceId": "dev_123",
    "serverTime": 1776352044
  }
}
```

```json
{
  "type": "time:sync",
  "ts": 1776352044,
  "payload": {
    "serverTime": 1776352044,
    "reason": "connect"
  }
}
```
