# Timescale Maintenance

Validation checklist after telemetry migrations:

1. `CREATE EXTENSION IF NOT EXISTS timescaledb` succeeds.
2. `sensor_samples` is a hypertable.
3. Compression and retention policies exist for raw telemetry.
4. Continuous aggregates refresh on schedule.
5. `last()` latest-reading queries return the same device snapshot as raw ordered reads.
6. Dashboard telemetry views agree with raw inserts in sampling tests.
