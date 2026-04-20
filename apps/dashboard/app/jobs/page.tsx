export default function JobsPage() {
  return (
    <main className="content">
      <section className="panel">
        <p className="eyebrow">Workers</p>
        <h1>Job status and queue activity</h1>
        <p className="lede">
          The worker app owns connector sync, telemetry rollups, recommendation fanout, audit compaction, and Spotify
          refresh jobs. This page is the future operator surface for those queues.
        </p>
      </section>
    </main>
  );
}
