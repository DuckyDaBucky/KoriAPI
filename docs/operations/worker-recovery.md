# Worker Recovery

Use this runbook when connector runs, telemetry rollups, Spotify refresh, or recommendation fanout stop progressing.

Checks:

1. Confirm recent entries in `/v1/admin/jobs`.
2. Inspect worker logs for `worker.job.started`, `worker.job.requeued`, and `worker.job.failed` audit events.
3. Inspect `connector_runs` and `worker_jobs` for stuck `queued` or `running` rows.
4. Check `metadata.retryCount`, `metadata.lastError`, and `metadata.lastHeartbeatAt` on affected jobs.
5. Restart the worker service if jobs are not advancing or the heartbeat is stale.
6. Requeue failed jobs by resetting `status` to `queued`, clearing `startedAt` and `completedAt`, and preserving metadata.
