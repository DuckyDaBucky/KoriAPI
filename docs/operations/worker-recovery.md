# Worker Recovery

Use this runbook when connector runs, telemetry rollups, Spotify refresh, or recommendation fanout stop progressing.

Checks:

1. Confirm recent entries in `/v1/admin/jobs`.
2. Inspect ECS worker logs in CloudWatch.
3. Inspect `connector_runs` and `worker_jobs` for stuck `queued` or `running` rows.
4. Restart the worker service if jobs are not advancing.
5. Requeue failed jobs by inserting a new `worker_jobs` row with the same metadata and a fresh `queued` status.
