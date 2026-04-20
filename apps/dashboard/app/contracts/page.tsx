import { fetchJson } from "@/lib/api";

async function getContracts() {
  const adminToken = process.env.KORI_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY;
  if (!adminToken) {
    return null;
  }

  try {
    return await fetchJson("/v1/admin/contracts", {
      headers: {
        "x-kori-admin-key": adminToken
      }
    });
  } catch {
    return null;
  }
}

export default async function ContractsPage() {
  const contracts = await getContracts();
  return (
    <main className="content">
      <section className="panel">
        <p className="eyebrow">Contracts</p>
        <h1>Generated API specifications</h1>
        <p className="lede">Manual manifest plus generated OpenAPI and AsyncAPI documents for the control plane.</p>
      </section>
      <section className="panel mono stream">{contracts ? JSON.stringify(contracts, null, 2) : "Set KORI_ADMIN_API_KEY to preview contract data."}</section>
    </main>
  );
}
