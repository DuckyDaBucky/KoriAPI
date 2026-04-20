import type { DeviceLiveState } from "@kori/shared";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveStream } from "@/components/live-stream";
import { fetchJson } from "@/lib/api";
import { requireDashboardSession } from "@/lib/auth";

export default async function DevicesPage() {
  const { session, sessionToken } = await requireDashboardSession();
  const devices = await fetchJson<DeviceLiveState[]>("/v1/admin/devices", {
    headers: {
      "x-kori-session": sessionToken
    }
  });

  return (
    <DashboardShell
      title="Devices and live sessions"
      description="Current connectivity, heartbeats, live sensor snapshots, and device-side operational posture."
      session={session}
    >
      <section className="panel">
        <h2>Registered devices</h2>
        <div className="data-list">
          {devices.length === 0 ? (
            <div className="data-card">
              <strong>No devices registered</strong>
              <p className="meta">Provision a device to start receiving telemetry and operator actions.</p>
            </div>
          ) : (
            devices.map((device) => (
              <div key={device.deviceId} className="data-card">
                <strong>{device.name ?? device.deviceId}</strong>
                <p className="meta">
                  {device.connected ? "connected" : "offline"} · firmware {device.firmwareVersion ?? "unknown"}
                </p>
                <p className="meta">Last seen {device.lastSeenAt ?? "never"}</p>
              </div>
            ))
          )}
        </div>
      </section>
      <LiveStream title="Device presence stream" stream="admin" sessionToken={sessionToken} />
    </DashboardShell>
  );
}
