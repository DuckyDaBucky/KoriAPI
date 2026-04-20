import type { DashboardView, Invitation, QuotaUsage } from "@kori/shared";
import { DashboardShell } from "@/components/dashboard-shell";
import { OperationsConsole } from "@/components/operations-console";
import { fetchJson } from "@/lib/api";
import { requireDashboardSession } from "@/lib/auth";

export default async function OperationsPage() {
  const { session, sessionToken } = await requireDashboardSession();
  const headers = {
    "x-kori-session": sessionToken
  };
  const [audit, quotas, views, invitations] = await Promise.all([
    fetchJson("/v1/admin/audit?limit=25", { headers }),
    fetchJson<QuotaUsage[]>("/v1/admin/quotas", { headers }),
    fetchJson<DashboardView[]>("/v1/admin/dashboard-views", { headers }),
    fetchJson<Invitation[]>("/v1/auth/invitations", { headers })
  ]);
  const primaryWorkspace = session.user.workspaces[0];

  return (
    <DashboardShell
      title="Auth, audits, quotas, and provisioning"
      description="Operator workflows for access control, provisioning, saved views, and recent audit activity."
      session={session}
    >
      <OperationsConsole
        sessionToken={sessionToken}
        workspaceId={primaryWorkspace?.id ?? "ws_dev"}
        userId={session.user.id}
        initialViews={views}
        initialInvitations={invitations}
      />

      <div className="grid two">
        <section className="panel">
          <h2>Quota posture</h2>
          <div className="data-list">
            {quotas.map((quota) => (
              <div key={quota.workspaceId} className="data-card">
                <strong>{quota.workspaceId}</strong>
                <p className="meta">
                  devices {quota.deviceCount}/{quota.deviceLimit} | storage {quota.storageMbUsed}/{quota.storageMbLimit} MB
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Recent audit</h2>
          <div className="data-list">
            {(audit as Array<{ id: string; action: string; createdAt: string; actorType: string }>).map((event) => (
              <div key={event.id} className="data-card">
                <strong>{event.action}</strong>
                <p className="meta">
                  {event.actorType} | {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
