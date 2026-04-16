# REST API

## `POST /v1/device/bootstrap`

Request:

```json
{
  "hardwareId": "AA:BB:CC:DD:EE:FF",
  "provisioningCode": "kori_prov_xxx",
  "deviceName": "Kori-CYD",
  "firmwareVersion": "0.3.0"
}
```

Response:

```json
{
  "deviceId": "dev_123",
  "deviceToken": "opaque-token",
  "wsUrl": "ws://localhost:3001/v1/ws/device",
  "config": {
    "telemetryIntervalSec": 2,
    "thresholds": {
      "co2Ppm": 1000,
      "noisePct": 75,
      "temperatureHighC": 28,
      "temperatureLowC": 18
    },
    "timerMethod": "pomodoro"
  },
  "serverTime": 1776352044,
  "protocolVersion": "2026-04-16"
}
```

## `POST /v1/device/token/rotate`
- Authenticate with `Authorization: Bearer <deviceToken>`.
- Rotate proactively when instructed by policy or after receiving authorization failures during reconnect.

## `GET /v1/device/config`
- Returns the latest effective device config.
- Use this after bootstrap and whenever the device needs to resync config after reconnect.
