# Message Catalog

Inbound device messages:
- `device:hello`
- `device:sensors`
- `device:health`
- `device:notification_event`
- `pong`

Outbound server messages:
- `session:ready`
- `time:sync`
- `notification:show`

Telemetry example:

```json
{
  "type": "device:sensors",
  "ts": 1776352044,
  "payload": {
    "deviceId": "dev_123",
    "sensors": {
      "temp": 24.2,
      "humidity": 48,
      "pressure": 1004,
      "co2": 820,
      "tvoc": 90,
      "noise": 34,
      "light": 61
    },
    "health": {
      "wifi": "ok",
      "bme280": "ok",
      "ccs811": "ok"
    }
  }
}
```

Notification ack example:

```json
{
  "type": "device:notification_event",
  "payload": {
    "deviceId": "dev_123",
    "notificationId": "dev_123:noise_high:1776352044",
    "action": "acknowledged"
  }
}
```
