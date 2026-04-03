# KoriAPI

Device-first backend scaffold for Kori.

## Workspace

- `apps/api`: Fastify API and WebSocket runtime
- `packages/shared`: shared REST and WebSocket contracts
- `packages/db`: Drizzle schema, migrations, and Neon database client

## Phase 1 included

- device bootstrap
- device WebSocket auth/runtime
- Redis-backed live state service
- deterministic rule engine
- server-authoritative time sync
- `better-auth` integration stub

## Environment

Copy `.env.example` to `.env` and fill in the values.

## Commands

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run build
npm run test
```
