"use client";

import { startTransition, useState } from "react";
import type { DashboardView, Invitation } from "@kori/shared";
import { getApiBaseUrl } from "@/lib/api";

type OperationsConsoleProps = {
  sessionToken: string;
  workspaceId: string;
  userId: string;
  initialViews: DashboardView[];
  initialInvitations: Invitation[];
};

type ProvisioningCodeResponse = {
  code: string;
  workspaceId: string;
  userId: string;
  expiresAt: string;
  label: string | null;
};

async function apiJson<T>(sessionToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-kori-session": sessionToken,
      ...(init?.headers ?? {})
    }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || "Request failed");
  }
  return JSON.parse(body) as T;
}

export function OperationsConsole({
  sessionToken,
  workspaceId,
  userId,
  initialViews,
  initialInvitations
}: OperationsConsoleProps) {
  const [views, setViews] = useState(initialViews);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [provisioningResult, setProvisioningResult] = useState<ProvisioningCodeResponse | null>(null);
  const [provisioningError, setProvisioningError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function saveView(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const filtersRaw = String(formData.get("filters") ?? "{}").trim();
    setSaveError(null);
    setBusyAction("save-view");

    try {
      const filters = JSON.parse(filtersRaw || "{}") as Record<string, unknown>;
      const view = await apiJson<DashboardView>(sessionToken, "/v1/admin/dashboard-views", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          name,
          filters
        })
      });
      startTransition(() => {
        setViews((previous) => [view, ...previous.filter((entry) => entry.id !== view.id)]);
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save view");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteView(id: string) {
    setBusyAction(`delete-view-${id}`);
    try {
      await apiJson(sessionToken, `/v1/admin/dashboard-views/${id}`, {
        method: "DELETE"
      });
      startTransition(() => {
        setViews((previous) => previous.filter((entry) => entry.id !== id));
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function createProvisioningCode(formData: FormData) {
    const label = String(formData.get("label") ?? "").trim();
    const expiresInSec = Number(formData.get("expiresInSec") ?? 600);
    setProvisioningError(null);
    setBusyAction("create-code");
    try {
      const result = await apiJson<ProvisioningCodeResponse>(sessionToken, "/v1/admin/provisioning-codes", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          userId,
          expiresInSec,
          ...(label ? { label } : {})
        })
      });
      setProvisioningResult(result);
    } catch (error) {
      setProvisioningError(error instanceof Error ? error.message : "Failed to create provisioning code");
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeInvitation(id: string) {
    setBusyAction(`revoke-invitation-${id}`);
    try {
      await apiJson(sessionToken, `/v1/auth/invitations/${id}`, {
        method: "DELETE"
      });
      startTransition(() => {
        setInvitations((previous) =>
          previous.map((invitation) => (invitation.id === id ? { ...invitation, status: "revoked" } : invitation))
        );
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="grid two">
      <section className="panel">
        <h2>Saved views</h2>
        <form
          className="form-grid"
          action={(formData) => {
            void saveView(formData);
          }}
        >
          <input name="name" type="text" placeholder="Today’s telemetry filters" required />
          <textarea
            name="filters"
            rows={5}
            placeholder='{"route":"/v1/admin/telemetry","severity":"info"}'
            defaultValue='{"workspaceId":"ws_dev"}'
          />
          {saveError ? <p className="error-text">{saveError}</p> : null}
          <button className="button" type="submit" disabled={busyAction === "save-view"}>
            {busyAction === "save-view" ? "Saving..." : "Save dashboard view"}
          </button>
        </form>
        <div className="data-list">
          {views.length === 0 ? (
            <div className="data-card">
              <strong>No saved views yet</strong>
              <p className="meta">Persist common operator filters here for repeat investigations.</p>
            </div>
          ) : (
            views.map((view) => (
              <div key={view.id} className="data-card">
                <strong>{view.name}</strong>
                <p className="meta">{view.workspaceId}</p>
                <p className="meta mono clamp">{JSON.stringify(view.filters)}</p>
                <button
                  className="button secondary inline-button"
                  type="button"
                  onClick={() => {
                    void deleteView(view.id);
                  }}
                  disabled={busyAction === `delete-view-${view.id}`}
                >
                  {busyAction === `delete-view-${view.id}` ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Provisioning and invites</h2>
        <form
          className="form-grid"
          action={(formData) => {
            void createProvisioningCode(formData);
          }}
        >
          <input name="label" type="text" placeholder="desk-lab-01" />
          <input name="expiresInSec" type="number" min={60} max={3600} defaultValue={600} />
          {provisioningError ? <p className="error-text">{provisioningError}</p> : null}
          <button className="button" type="submit" disabled={busyAction === "create-code"}>
            {busyAction === "create-code" ? "Creating..." : "Create provisioning code"}
          </button>
        </form>

        {provisioningResult ? (
          <div className="data-card">
            <strong>{provisioningResult.code}</strong>
            <p className="meta">Expires {new Date(provisioningResult.expiresAt).toLocaleString()}</p>
          </div>
        ) : null}

        <div className="data-list">
          {invitations.length === 0 ? (
            <div className="data-card">
              <strong>No invitations</strong>
              <p className="meta">Pending and revoked invites appear here for operator review.</p>
            </div>
          ) : (
            invitations.map((invitation) => (
              <div key={invitation.id} className="data-card">
                <strong>{invitation.email}</strong>
                <p className="meta">
                  {invitation.role} | {invitation.status} | expires {new Date(invitation.expiresAt).toLocaleString()}
                </p>
                {invitation.status === "pending" ? (
                  <button
                    className="button secondary inline-button"
                    type="button"
                    onClick={() => {
                      void revokeInvitation(invitation.id);
                    }}
                    disabled={busyAction === `revoke-invitation-${invitation.id}`}
                  >
                    {busyAction === `revoke-invitation-${invitation.id}` ? "Revoking..." : "Revoke"}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
