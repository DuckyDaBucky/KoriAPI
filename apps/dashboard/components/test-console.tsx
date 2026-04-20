"use client";

import { startTransition, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";

const allowedPaths = [
  "/health",
  "/v1/admin/overview",
  "/v1/admin/logs",
  "/v1/admin/audit",
  "/v1/admin/devices",
  "/v1/admin/jobs",
  "/v1/admin/quotas",
  "/v1/admin/contracts",
  "/v1/admin/contracts/openapi.json",
  "/v1/admin/contracts/asyncapi.json",
  "/v1/admin/telemetry",
  "/v1/connectors/configs",
  "/v1/connectors/runs",
  "/v1/service-tokens"
] as const;

export function TestConsole({ sessionToken }: { sessionToken: string }) {
  const [path, setPath] = useState<(typeof allowedPaths)[number]>("/v1/admin/overview");
  const [result, setResult] = useState<string>("No request executed yet.");
  const [pending, setPending] = useState(false);

  async function runRequest() {
    setPending(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/v1/admin/test-console`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-kori-session": sessionToken
        },
        body: JSON.stringify({
          method: "GET",
          path
        })
      });
      const body = await response.json();
      startTransition(() => {
        setResult(JSON.stringify(body, null, 2));
      });
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <h2>Safe API test console</h2>
      <div className="form-grid">
        <select value={path} onChange={(event) => setPath(event.target.value as (typeof allowedPaths)[number])}>
          {allowedPaths.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <button className="button" type="button" onClick={() => void runRequest()} disabled={pending}>
          {pending ? "Running..." : "Run allowlisted GET"}
        </button>
      </div>
      <div className="stream panel mono">{result}</div>
    </section>
  );
}
