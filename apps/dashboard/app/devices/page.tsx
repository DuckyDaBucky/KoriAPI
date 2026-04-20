import { LiveStream } from "@/components/live-stream";

export default function DevicesPage() {
  return (
    <main className="content">
      <section className="panel">
        <p className="eyebrow">Devices</p>
        <h1>Device and session monitor</h1>
        <p className="lede">Live websocket stream placeholder for device presence, health, config updates, and operator actions.</p>
      </section>
      <LiveStream
        title="Admin stream"
        stream="admin"
        adminToken={process.env.KORI_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY}
      />
    </main>
  );
}
