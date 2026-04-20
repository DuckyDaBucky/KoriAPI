# Secret Rotation

Rotate these secrets through AWS Secrets Manager and then roll ECS services:

- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_API_KEY`
- `APP_ENCRYPTION_KEY`
- Spotify credentials

Procedure:

1. Create the new secret version in Secrets Manager.
2. Update the task definition revision to reference the current version.
3. Roll `api`, `dashboard`, and `worker` services.
4. Verify `/health`, `/v1/admin/overview`, and worker logs.
