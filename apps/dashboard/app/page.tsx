import Link from "next/link";
import { fetchJson } from "@/lib/api";

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

async function getOverview(): Promise<Overview | null> {
  const adminToken = process.env.KORI_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY;
  if (!adminToken) {
    return null;
  }

  try {
    return await fetchJson<Overview>("/v1/admin/overview", {
      headers: {
        "x-kori-admin-key": adminToken
      }
    });
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const overview = await getOverview();

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="eyebrow">KoriAPI</p>
          <h2>Control Plane</h2>
          <p className="lede">Admin-only interface for devices, telemetry, auth, quotas, contracts, and integrations.</p>
        </div>
        <nav className="nav">
          <Link href="/">Overview</Link>
          <Link href="/login">Login</Link>
          <a href="/contracts">Contracts</a>
          <a href="/devices">Devices</a>
          <a href="/telemetry">Telemetry</a>
          <a href="/jobs">Jobs</a>
          <a href="/integrations">Integrations</a>
        </nav>
      </aside>
      <section className="content">
        <div className="hero">
          <div>
            <p className="eyebrow">Production Admin</p>
            <h1>Kori internal dashboard</h1>
            <p className="lede">
              This Next.js app replaces the old static console and is designed to front the same API and websocket
              streams with server-rendered pages plus client live-panels.
            </p>
          </div>
          <div className="panel">
            <h3>Runtime target</h3>
            <p className="meta">Next.js admin app + Fastify API + worker service + Terraform-managed AWS runtime</p>
          </div>
        </div>

        <div className="status-strip">
          <div className="status-pill">
            <strong>{overview?.counts.devices ?? "--"}</strong>
            <span className="meta">registered devices</span>
          </div>
          <div className="status-pill">
            <strong>{overview?.counts.connectedDevices ?? "--"}</strong>
            <span className="meta">connected devices</span>
          </div>
          <div className="status-pill">
            <strong>{overview?.services.database ?? "--"}</strong>
            <span className="meta">database health</span>
          </div>
          <div className="status-pill">
            <strong>{overview?.services.redis ?? "--"}</strong>
            <span className="meta">redis health</span>
          </div>
        </div>

        <div className="grid two">
          <section className="panel">
            <h2>Migration posture</h2>
            <div className="data-list">
              <div className="data-card">
                <strong>Operator workflows preserved</strong>
                <p className="meta">Provisioning, log inspection, contract browsing, quota visibility, and connector runs remain API-backed.</p>
              </div>
              <div className="data-card">
                <strong>Server-first pages</strong>
                <p className="meta">The dashboard uses App Router server rendering for initial data and client websocket panels for live state.</p>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Implementation status</h2>
            <div className="data-list">
              <div className="data-card">
                <strong>Admin overview wired</strong>
                <p className="meta">Reads the live API if `KORI_ADMIN_API_KEY` is present in the dashboard environment.</p>
              </div>
              <div className="data-card">
                <strong>Section shells created</strong>
                <p className="meta">Contracts, devices, telemetry, jobs, and integrations sections are scaffolded for follow-on rendering work.</p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
