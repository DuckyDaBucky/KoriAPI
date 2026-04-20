# KoriAPI

Platform control plane for Kori devices, live telemetry, admin observability, integrations, background workers, and internal dashboard tooling.

## Workspace

- `apps/api`: Fastify API, device runtime, admin APIs, security/auth surfaces, contracts, and live session streams
- `apps/dashboard`: Next.js App Router admin dashboard with cookie-backed session auth
- `apps/worker`: background worker for connector sync, telemetry rollups, recommendation fanout, audit compaction, and Spotify refresh
- `packages/shared`: shared REST and WebSocket contracts
- `packages/db`: Drizzle schema, seed script, and Neon database client
- `docs/device`: ESP32 integration and protocol handoff documentation
- `docs/operations`: runtime runbooks for secrets, workers, Spotify recovery, and Timescale maintenance
- `infra/terraform`: AWS deployment scaffold for API, dashboard, worker, logs, and assets

## Current foundation

- device bootstrap with legacy API key or single-use provisioning code
- device WebSocket auth/runtime
- Redis-backed live state service
- server-authoritative time sync
- device token rotation and config retrieval
- admin-only overview, logs, audit, and provisioning APIs
- MFA enrollment/verification/disable flows
- password reset request and reset flows
- invitations and service tokens
- connector config and connector run APIs
- admin device revoke, reprovision, config update, and mark-offline actions
- admin jobs, quotas, and generated contract endpoints
- authenticated Next.js dashboard in `apps/dashboard`
- Spotify ambient presence integration scaffolding
- audit trail and observability event stream foundations

## Environment

Copy [apps/api/.env.example](/c:/Users/hasna/Documents/KoriAPI/apps/api/.env.example) to `apps/api/.env` or `.env` at the repo root and fill in the values.

Important variables:
- `ADMIN_API_KEY`: admin access for emergency `/v1/admin/*` operations
- `APP_ENCRYPTION_KEY`: encryption key for protected integration secrets
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`: Spotify presence integration
- `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`: local auth bootstrap account for login-backed dashboard access
- `WORKER_POLL_INTERVAL_MS`: worker queue polling interval

## Commands

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run build
npm run test
npm run contracts:generate
```
