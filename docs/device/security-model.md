# Security Model

Rules:
- Never embed user identity, Spotify tokens, or admin keys in firmware.
- Store `deviceToken` in protected NVS or equivalent secure storage.
- Do not print tokens, provisioning codes, or headers to serial logs.
- Provisioning codes are single-use and short-lived.
- Device tokens are opaque and rotatable.

Recommended firmware practice:
- Zero sensitive buffers after successful parsing where feasible.
- Treat any `401` from protected endpoints as a credential issue.
- Re-fetch time using `time:sync` and avoid trusting local wall-clock drift for auth decisions.

Backend guarantees in this repo:
- Tokens are hashed at rest.
- Spotify refresh tokens are encrypted at rest.
- Device-facing routes avoid returning user profile data or third-party secrets.
