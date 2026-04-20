import type { TelemetryBucket, TelemetryLatest } from "@kori/shared";
import { DashboardShell } from "@/components/dashboard-shell";
import { fetchJson } from "@/lib/api";
import { requireDashboardSession } from "@/lib/auth";

type TelemetryOverview = {
  buckets: TelemetryBucket[];
  latest: TelemetryLatest[];
};

export default async function TelemetryPage() {
  const { session, sessionToken } = await requireDashboardSession();
  const telemetry = await fetchJson<TelemetryOverview>("/v1/admin/telemetry?hours=24&bucketMinutes=15", {
    headers: {
      "x-kori-session": sessionToken
    }
  });

  return (
    <DashboardShell
      title="Telemetry and Timescale views"
      description="Aggregated buckets, latest readings, and staging telemetry summaries built for Timescale-backed queries."
      session={session}
    >
      <div className="grid two">
        <section className="panel">
          <h2>Latest readings</h2>
          <div className="data-list">
            {telemetry.latest.length === 0 ? (
              <div className="data-card">
                <strong>No telemetry yet</strong>
                <p className="meta">The telemetry overview will populate after the first sensor uploads.</p>
              </div>
            ) : (
              telemetry.latest.slice(0, 8).map((sample) => (
                <div key={`${sample.deviceId}-${sample.receivedAt}`} className="data-card">
                  <strong>{sample.deviceId}</strong>
                  <p className="meta">
                    {sample.receivedAt} · noise {sample.noisePct}% · light {sample.lightPct}%
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Bucket summaries</h2>
          <div className="data-list">
            {telemetry.buckets.length === 0 ? (
              <div className="data-card">
                <strong>No bucketed data</strong>
                <p className="meta">`time_bucket` aggregates will show here once telemetry exists.</p>
              </div>
            ) : (
              telemetry.buckets.slice(-8).reverse().map((bucket) => (
                <div key={bucket.bucketStart} className="data-card">
                  <strong>{bucket.bucketStart}</strong>
                  <p className="meta">
                    {bucket.sampleCount} samples · avg noise {bucket.avgNoisePct ?? "--"} · avg CO2{" "}
                    {bucket.avgCo2Ppm ?? "--"}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
