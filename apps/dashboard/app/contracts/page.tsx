import { DashboardShell } from "@/components/dashboard-shell";
import { TestConsole } from "@/components/test-console";
import { fetchJson } from "@/lib/api";
import { requireDashboardSession } from "@/lib/auth";

export default async function ContractsPage() {
  const { session, sessionToken } = await requireDashboardSession();
  const headers = {
    "x-kori-session": sessionToken
  };
  const [manifest, openapi, asyncapi] = await Promise.all([
    fetchJson("/v1/admin/contracts", { headers }),
    fetchJson("/v1/admin/contracts/openapi.json", { headers }),
    fetchJson("/v1/admin/contracts/asyncapi.json", { headers })
  ]);

  return (
    <DashboardShell
      title="Contracts and API explorer"
      description="REST manifest plus generated OpenAPI and AsyncAPI documents exposed through the authenticated dashboard."
      session={session}
    >
      <TestConsole sessionToken={sessionToken} />
      <div className="grid">
        <section className="panel mono stream">{JSON.stringify(manifest, null, 2)}</section>
        <section className="panel mono stream">{JSON.stringify(openapi, null, 2)}</section>
        <section className="panel mono stream">{JSON.stringify(asyncapi, null, 2)}</section>
      </div>
    </DashboardShell>
  );
}
