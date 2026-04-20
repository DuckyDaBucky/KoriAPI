export default function TelemetryPage() {
  return (
    <main className="content">
      <section className="panel">
        <p className="eyebrow">Telemetry</p>
        <h1>Timescale-backed telemetry views</h1>
        <p className="lede">
          This section is reserved for aggregate panels driven by `time_bucket`, `last()`, retention policy status,
          drift alerts, and per-workspace usage.
        </p>
      </section>
    </main>
  );
}
