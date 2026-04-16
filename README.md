# KoriAPI

Platform control plane for Kori devices, live telemetry, admin observability, and integration scaffolding.

## Workspace

- `apps/api`: Fastify API, device runtime, admin APIs, Spotify integration, and live session streams
- `apps/dashboard`: zero-dependency developer dashboard served by the API
- `packages/shared`: shared REST and WebSocket contracts
- `packages/db`: Drizzle schema, seed script, and Neon database client
- `docs/device`: ESP32 integration and protocol handoff documentation

## Current foundation

- device bootstrap with legacy API key or single-use provisioning code
- device WebSocket auth/runtime
- Redis-backed live state service
- server-authoritative time sync
- device token rotation and config retrieval
- admin-only overview, logs, audit, and provisioning APIs
- live developer dashboard at `/admin/dashboard`
- Spotify ambient presence integration scaffolding
- audit trail and observability event stream foundations

## Environment

Copy [apps/api/.env.example](/c:/Users/hasna/Documents/KoriAPI/apps/api/.env.example) to `apps/api/.env` or `.env` at the repo root and fill in the values.

Important variables:
- `ADMIN_API_KEY`: admin access for `/v1/admin/*` and the dashboard
- `APP_ENCRYPTION_KEY`: encryption key for protected integration secrets
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`: Spotify presence integration
- `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`: local auth bootstrap account for login-backed dashboard access

## Commands

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run build
npm run test
```
