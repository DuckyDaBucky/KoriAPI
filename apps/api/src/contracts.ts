import { wsEventTypes } from "@kori/shared";

export type RestContractEntry = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: "public" | "session" | "admin" | "device";
  summary: string;
};

export const restContracts: RestContractEntry[] = [
  { method: "GET", path: "/health", auth: "public", summary: "Service health" },
  { method: "POST", path: "/v1/auth/register", auth: "public", summary: "Register a new account" },
  { method: "POST", path: "/v1/auth/login", auth: "public", summary: "Create a session" },
  { method: "GET", path: "/v1/auth/session", auth: "session", summary: "Resolve the current session" },
  { method: "POST", path: "/v1/auth/logout", auth: "session", summary: "Logout the current session" },
  { method: "POST", path: "/v1/auth/password/forgot", auth: "public", summary: "Request a password reset" },
  { method: "POST", path: "/v1/auth/password/reset", auth: "public", summary: "Reset a password with a token" },
  { method: "POST", path: "/v1/auth/mfa/enroll", auth: "session", summary: "Enroll a TOTP MFA factor" },
  { method: "POST", path: "/v1/auth/mfa/verify", auth: "session", summary: "Verify an enrolled MFA factor" },
  { method: "POST", path: "/v1/auth/mfa/disable", auth: "session", summary: "Disable an MFA factor" },
  { method: "GET", path: "/v1/auth/invitations", auth: "admin", summary: "List invitations" },
  { method: "POST", path: "/v1/auth/invitations", auth: "admin", summary: "Create a workspace invitation" },
  { method: "POST", path: "/v1/auth/invitations/:id/accept", auth: "session", summary: "Accept an invitation token" },
  { method: "GET", path: "/v1/service-tokens", auth: "admin", summary: "List service tokens" },
  { method: "POST", path: "/v1/service-tokens", auth: "admin", summary: "Create a service token" },
  { method: "DELETE", path: "/v1/service-tokens/:id", auth: "admin", summary: "Revoke a service token" },
  { method: "GET", path: "/v1/workspaces", auth: "session", summary: "List workspaces" },
  { method: "POST", path: "/v1/device/bootstrap", auth: "public", summary: "Bootstrap a device" },
  { method: "POST", path: "/v1/device/token/rotate", auth: "device", summary: "Rotate device token" },
  { method: "GET", path: "/v1/device/config", auth: "device", summary: "Fetch device config" },
  { method: "GET", path: "/v1/notes", auth: "session", summary: "List notes" },
  { method: "POST", path: "/v1/notes", auth: "session", summary: "Create a note" },
  { method: "PATCH", path: "/v1/notes/:noteId", auth: "session", summary: "Update a note" },
  { method: "DELETE", path: "/v1/notes/:noteId", auth: "session", summary: "Delete a note" },
  { method: "GET", path: "/v1/deadlines", auth: "session", summary: "List deadlines" },
  { method: "POST", path: "/v1/deadlines", auth: "session", summary: "Create a deadline" },
  { method: "PATCH", path: "/v1/deadlines/:deadlineId", auth: "session", summary: "Update a deadline" },
  { method: "DELETE", path: "/v1/deadlines/:deadlineId", auth: "session", summary: "Delete a deadline" },
  { method: "GET", path: "/v1/recommendations", auth: "session", summary: "List recommendations" },
  { method: "POST", path: "/v1/recommendations", auth: "session", summary: "Create a recommendation" },
  { method: "PATCH", path: "/v1/recommendations/:recommendationId", auth: "session", summary: "Update a recommendation" },
  { method: "DELETE", path: "/v1/recommendations/:recommendationId", auth: "session", summary: "Delete a recommendation" },
  { method: "GET", path: "/v1/connectors/configs", auth: "admin", summary: "List connector configs" },
  { method: "POST", path: "/v1/connectors/configs", auth: "admin", summary: "Create or update connector config" },
  { method: "GET", path: "/v1/connectors/runs", auth: "admin", summary: "List connector runs" },
  { method: "POST", path: "/v1/connectors/runs", auth: "admin", summary: "Trigger connector run" },
  { method: "GET", path: "/v1/admin/overview", auth: "admin", summary: "Admin overview" },
  { method: "GET", path: "/v1/admin/logs", auth: "admin", summary: "Structured logs" },
  { method: "GET", path: "/v1/admin/audit", auth: "admin", summary: "Audit trail" },
  { method: "GET", path: "/v1/admin/devices", auth: "admin", summary: "Device states" },
  { method: "POST", path: "/v1/admin/devices/:id/revoke", auth: "admin", summary: "Revoke a device token" },
  { method: "POST", path: "/v1/admin/devices/:id/reprovision", auth: "admin", summary: "Reprovision a device token" },
  { method: "POST", path: "/v1/admin/devices/:id/config", auth: "admin", summary: "Update device config" },
  { method: "POST", path: "/v1/admin/devices/:id/mark-offline", auth: "admin", summary: "Mark device offline" },
  { method: "POST", path: "/v1/admin/provisioning-codes", auth: "admin", summary: "Create provisioning code" },
  { method: "GET", path: "/v1/admin/telemetry", auth: "admin", summary: "Telemetry overview" },
  { method: "POST", path: "/v1/admin/telemetry/enable-timescale", auth: "admin", summary: "Enable Timescale" },
  { method: "GET", path: "/v1/admin/jobs", auth: "admin", summary: "List worker jobs" },
  { method: "GET", path: "/v1/admin/quotas", auth: "admin", summary: "List quota usage" },
  { method: "GET", path: "/v1/admin/contracts", auth: "admin", summary: "Contract manifest" },
  { method: "GET", path: "/v1/admin/contracts/openapi.json", auth: "admin", summary: "Generated OpenAPI document" },
  { method: "GET", path: "/v1/admin/contracts/asyncapi.json", auth: "admin", summary: "Generated AsyncAPI document" },
  { method: "GET", path: "/v1/integrations/spotify/connect", auth: "admin", summary: "Start Spotify OAuth" },
  { method: "GET", path: "/v1/integrations/spotify/callback", auth: "public", summary: "Handle Spotify OAuth callback" },
  { method: "GET", path: "/v1/integrations/spotify/status", auth: "admin", summary: "Get Spotify status" },
  { method: "POST", path: "/v1/integrations/spotify/presence", auth: "admin", summary: "Refresh Spotify presence" },
  { method: "POST", path: "/v1/integrations/spotify/disconnect", auth: "admin", summary: "Disconnect Spotify" }
];

const sharedSchemas = [
  "AuthUser",
  "Workspace",
  "MfaFactor",
  "Invitation",
  "ServiceToken",
  "DashboardView",
  "DeviceConfig",
  "Note",
  "NoteRevision",
  "Deadline",
  "Recommendation",
  "ConnectorConfig",
  "ConnectorRun",
  "JobStatus",
  "QuotaUsage",
  "TemporalEvent",
  "TemporalSignal",
  "DeveloperLogEvent",
  "DeviceLiveState",
  "SpotifyPresence",
  "ErrorEnvelope"
];

export function buildContractsManifest() {
  return {
    generatedAt: new Date().toISOString(),
    rest: restContracts,
    websocket: {
      devicePath: "/v1/ws/device",
      sessionPath: "/v1/ws/session",
      inboundTypes: [
        wsEventTypes.deviceHello,
        wsEventTypes.deviceSensors,
        wsEventTypes.deviceHealth,
        wsEventTypes.deviceNotificationEvent,
        wsEventTypes.pong
      ],
      outboundTypes: [
        wsEventTypes.sessionReady,
        wsEventTypes.adminReady,
        wsEventTypes.adminLog,
        wsEventTypes.adminDeviceState,
        wsEventTypes.adminAudit,
        wsEventTypes.adminSpotifyPresence,
        wsEventTypes.adminOverview,
        wsEventTypes.notificationShow,
        wsEventTypes.recommendationShow,
        wsEventTypes.spotifyState,
        wsEventTypes.timeSync,
        wsEventTypes.ping
      ]
    },
    sharedSchemas
  };
}

function methodPathMap() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const entry of restContracts) {
    const normalizedPath = entry.path.replace(/:([A-Za-z]+)/g, "{$1}");
    paths[normalizedPath] ??= {};
    paths[normalizedPath][entry.method.toLowerCase()] = {
      summary: entry.summary,
      tags: [entry.path.startsWith("/v1/admin") ? "admin" : entry.path.split("/")[2] ?? "core"],
      security: entry.auth === "public" ? [] : [{ koriAuth: [entry.auth] }],
      responses: {
        "200": {
          description: "Success"
        }
      }
    };
  }
  return paths;
}

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "KoriAPI",
      version: "0.2.0"
    },
    servers: [
      {
        url: "http://localhost:3001"
      }
    ],
    paths: methodPathMap(),
    components: {
      securitySchemes: {
        koriAuth: {
          type: "apiKey",
          in: "header",
          name: "x-kori-session"
        }
      },
      schemas: Object.fromEntries(sharedSchemas.map((name) => [name, { type: "object" }]))
    }
  };
}

export function buildAsyncApiDocument() {
  return {
    asyncapi: "3.0.0",
    info: {
      title: "KoriAPI Realtime Contracts",
      version: "0.2.0"
    },
    channels: {
      "/v1/ws/device": {
        address: "/v1/ws/device",
        messages: Object.fromEntries(
          [
            wsEventTypes.deviceHello,
            wsEventTypes.deviceSensors,
            wsEventTypes.deviceHealth,
            wsEventTypes.deviceNotificationEvent,
            wsEventTypes.pong,
            wsEventTypes.notificationShow,
            wsEventTypes.timeSync
          ].map((type) => [type, { name: type }])
        )
      },
      "/v1/ws/session": {
        address: "/v1/ws/session",
        messages: Object.fromEntries(
          [
            wsEventTypes.sessionReady,
            wsEventTypes.adminReady,
            wsEventTypes.adminLog,
            wsEventTypes.adminDeviceState,
            wsEventTypes.adminAudit,
            wsEventTypes.adminSpotifyPresence,
            wsEventTypes.adminOverview,
            wsEventTypes.recommendationShow,
            wsEventTypes.spotifyState,
            wsEventTypes.ping
          ].map((type) => [type, { name: type }])
        )
      }
    }
  };
}
