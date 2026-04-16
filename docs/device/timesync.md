# Time Sync

KoriAPI is server-authoritative for time.

Current mechanism:
- The bootstrap response returns `serverTime`.
- The WebSocket sends `time:sync` on connect.

Recommended device behavior:
- Track a `serverOffsetSec = serverTime - localUnixTime`.
- Apply the offset when stamping outbound telemetry if precise sync matters.
- Refresh the offset on every reconnect and after long sleep cycles.
