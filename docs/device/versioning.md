# Versioning

Current protocol version:
- `2026-04-16`

Compatibility guidance:
- The bootstrap response includes `protocolVersion`.
- Firmware should surface a warning if the server protocol is newer than the firmware’s known version.
- Treat unknown outbound message types as ignorable unless they are required for auth or sync.
- Keep parsers tolerant to additive fields.
