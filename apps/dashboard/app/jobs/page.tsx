import type { JobStatus } from "@kori/shared";
import { DashboardShell } from "@/components/dashboard-shell";
import { fetchJson } from "@/lib/api";
import { requireDashboardSession } from "@/lib/auth";

export default async function JobsPage() {
  const { session, sessionToken } = await requireDashboardSession();
  const jobs = await fetchJson<JobStatus[]>("/v1/admin/jobs", {
    headers: {
      "x-kori-session": sessionToken
    }
  });

  return (
    <DashboardShell
      title="Worker jobs"
      description="Connector sync, telemetry rollups, recommendation fanout, audit compaction, and Spotify refresh execution."
      session={session}
    >
      <section className="panel">
        <h2>Queue and execution history</h2>
        <div className="data-list">
          {jobs.length === 0 ? (
            <div className="data-card">
              <strong>No jobs found</strong>
              <p className="meta">The worker service has not enqueued any jobs yet.</p>
            </div>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="data-card">
                <strong>{job.kind}</strong>
                <p className="meta">
                  {job.status} · created {job.createdAt}
                </p>
                <p className="meta">Workspace {job.workspaceId ?? "global"}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
