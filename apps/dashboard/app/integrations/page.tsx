import type { ConnectorConfig, ConnectorRun, SpotifyPresence } from "@kori/shared";
import { DashboardShell } from "@/components/dashboard-shell";
import { fetchJson } from "@/lib/api";
import { requireDashboardSession } from "@/lib/auth";

type SpotifyStatus = {
  connected: boolean;
  userId: string;
  spotifyUserId: string | null;
  scopes: string[];
  lastSyncedAt: string | null;
  presence: SpotifyPresence | null;
};

export default async function IntegrationsPage() {
  const { session, sessionToken } = await requireDashboardSession();
  const headers = {
    "x-kori-session": sessionToken
  };
  const [configs, runs, spotifyStatus] = await Promise.all([
    fetchJson<ConnectorConfig[]>("/v1/connectors/configs", { headers }),
    fetchJson<ConnectorRun[]>("/v1/connectors/runs", { headers }),
    fetchJson<SpotifyStatus>(`/v1/integrations/spotify/status?userId=${encodeURIComponent(session.user.id)}`, {
      headers
    }).catch(() => ({
      connected: false,
      userId: session.user.id,
      spotifyUserId: null,
      scopes: [],
      lastSyncedAt: null,
      presence: null
    }))
  ]);

  return (
    <DashboardShell
      title="Integrations and provider activity"
      description="Spotify presence plus academic connector configuration and execution history."
      session={session}
    >
      <div className="grid two">
        <section className="panel">
          <h2>Spotify</h2>
          <div className="data-card">
            <strong>{spotifyStatus.connected ? "Connected" : "Not connected"}</strong>
            <p className="meta">Spotify user {spotifyStatus.spotifyUserId ?? "n/a"}</p>
            <p className="meta">Last sync {spotifyStatus.lastSyncedAt ?? "never"}</p>
            <p className="meta">
              Current track {spotifyStatus.presence?.trackName ?? "none"} · {spotifyStatus.presence?.deviceName ?? "n/a"}
            </p>
          </div>
        </section>

        <section className="panel">
          <h2>Connector configs</h2>
          <div className="data-list">
            {configs.length === 0 ? (
              <div className="data-card">
                <strong>No connector configs</strong>
                <p className="meta">Crossref, ORCID, Semantic Scholar, and AI providers appear here after setup.</p>
              </div>
            ) : (
              configs.map((config) => (
                <div key={config.id} className="data-card">
                  <strong>{config.provider}</strong>
                  <p className="meta">{config.workspaceId}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Connector runs</h2>
        <div className="data-list">
          {runs.length === 0 ? (
            <div className="data-card">
              <strong>No connector runs</strong>
              <p className="meta">Trigger a run from the API or worker queue to populate this timeline.</p>
            </div>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="data-card">
                <strong>{run.provider}</strong>
                <p className="meta">
                  {run.status} · started {run.startedAt}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
