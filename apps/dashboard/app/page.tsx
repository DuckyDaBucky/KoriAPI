import type { JobStatus, QuotaUsage } from "@kori/shared";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveStream } from "@/components/live-stream";
import { fetchJson } from "@/lib/api";
import { requireDashboardSession } from "@/lib/auth";

type Overview = {
  generatedAt: string;
  counts: {
    devices: number;
    connectedDevices: number;
    recentLogs: number;
    recentAuditEvents: number;
    spotifyConnections: number;
  };
  services: {
    database: string;
    redis: string;
  };
};

async function getDashboardData(sessionToken: string) {
  const headers = {
    "x-kori-session": sessionToken
  };

  const [overview, quotas, jobs] = await Promise.all([
    fetchJson<Overview>("/v1/admin/overview", { headers }),
    fetchJson<QuotaUsage[]>("/v1/admin/quotas", { headers }),
    fetchJson<JobStatus[]>("/v1/admin/jobs", { headers })
  ]);

  return { overview, quotas, jobs };
}

export default async function HomePage() {
  const { session, sessionToken } = await requireDashboardSession();
  const { overview, quotas, jobs } = await getDashboardData(sessionToken);
  const primaryWorkspace = session.user.workspaces[0];

  return (
    <DashboardShell
      title="Control plane overview"
      description="Live service health, quota posture, queue pressure, and admin stream visibility for the staging stack."
      session={session}
    >
      <div className="status-strip">
        <div className="status-pill">
          <strong>{overview.counts.devices}</strong>
          <span className="meta">registered devices</span>
        </div>
        <div className="status-pill">
          <strong>{overview.counts.connectedDevices}</strong>
          <span className="meta">connected devices</span>
        </div>
        <div className="status-pill">
          <strong>{overview.services.database}</strong>
          <span className="meta">database health</span>
        </div>
        <div className="status-pill">
          <strong>{overview.services.redis}</strong>
          <span className="meta">redis health</span>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Workspace posture</h2>
          <div className="data-list">
            <div className="data-card">
              <strong>{primaryWorkspace?.name ?? "No workspace"}</strong>
              <p className="meta">Primary workspace for this operator session.</p>
            </div>
            {quotas.map((quota) => (
              <div key={quota.workspaceId} className="data-card">
                <strong>{quota.workspaceId}</strong>
                <p className="meta">
                  {quota.deviceCount}/{quota.deviceLimit} devices, {quota.storageMbUsed}/{quota.storageMbLimit} MB
                  storage
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Queue posture</h2>
          <div className="data-list">
            {jobs.length === 0 ? (
              <div className="data-card">
                <strong>No queued jobs</strong>
                <p className="meta">Connector sync, Spotify refresh, rollups, and audit compaction are idle.</p>
              </div>
            ) : (
              jobs.slice(0, 5).map((job) => (
                <div key={job.id} className="data-card">
                  <strong>{job.kind}</strong>
                  <p className="meta">
                    {job.status} · {job.workspaceId ?? "global"}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <LiveStream title="Admin stream" stream="admin" sessionToken={sessionToken} />
    </DashboardShell>
  );
}
