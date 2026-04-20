import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/app.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/koriapi?schema=public",
  REDIS_URL: "redis://localhost:6379",
  PUBLIC_WS_URL: "ws://localhost:3001/v1/ws/device",
  ADMIN_API_KEY: "kori-development-admin-key",
  APP_ENCRYPTION_KEY: "kori-development-encryption-key"
};

test("health route reports service status", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.services.database, "up");
  assert.equal(body.services.redis, "up");

  await app.close();
});

test("bootstrap returns device credentials and ws url", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/device/bootstrap",
    payload: {
      hardwareId: "AA:BB:CC:DD:EE:FF",
      userApiKey: "dev-user-api-key",
      deviceName: "Kori-CYD",
      firmwareVersion: "0.2.0"
    }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.deviceId, "dev_1");
  assert.equal(body.wsUrl, baseEnv.PUBLIC_WS_URL);
  assert.equal(body.config.telemetryIntervalSec, 2);
  assert.equal(body.protocolVersion, "2026-04-16");
  assert.ok(typeof body.serverTime === "number");

  await app.close();
});

test("bootstrap supports provisioning code flow", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe123!"
    }
  });
  const sessionToken = login.json().sessionToken as string;

  const codeResponse = await app.inject({
    method: "POST",
    url: "/v1/admin/provisioning-codes",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      workspaceId: "ws_dev",
      userId: "user_dev",
      expiresInSec: 600,
      label: "test-code"
    }
  });

  assert.equal(codeResponse.statusCode, 201);
  const codeBody = codeResponse.json();

  const response = await app.inject({
    method: "POST",
    url: "/v1/device/bootstrap",
    payload: {
      hardwareId: "11:22:33:44:55:66",
      provisioningCode: codeBody.code,
      deviceName: "Kori-Desk",
      firmwareVersion: "0.3.0"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().deviceId, "dev_1");

  await app.close();
});

test("bootstrap rejects invalid credentials", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/device/bootstrap",
    payload: {
      hardwareId: "AA:BB:CC:DD:EE:FF",
      userApiKey: "wrong-key",
      deviceName: "Kori-CYD",
      firmwareVersion: "0.2.0"
    }
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});

test("admin overview requires an admin session and rejects the legacy admin key outside development", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const unauthorized = await app.inject({
    method: "GET",
    url: "/v1/admin/overview"
  });
  assert.equal(unauthorized.statusCode, 401);

  const authorized = await app.inject({
    method: "GET",
    url: "/v1/admin/overview",
    headers: {
      "x-kori-admin-key": baseEnv.ADMIN_API_KEY
    }
  });

  assert.equal(authorized.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe123!"
    }
  });
  const sessionToken = login.json().sessionToken as string;

  const sessionAuthorized = await app.inject({
    method: "GET",
    url: "/v1/admin/overview",
    headers: {
      "x-kori-session": sessionToken
    }
  });

  assert.equal(sessionAuthorized.statusCode, 200);
  assert.equal(sessionAuthorized.json().counts.devices, 0);

  await app.close();
});

test("auth login returns a session and workspaces list", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe123!"
    }
  });

  assert.equal(login.statusCode, 200);
  const session = login.json();
  assert.ok(typeof session.sessionToken === "string");
  assert.equal(session.user.workspaces[0].role, "platform_admin");

  const workspaces = await app.inject({
    method: "GET",
    url: "/v1/workspaces",
    headers: {
      "x-kori-session": session.sessionToken
    }
  });

  assert.equal(workspaces.statusCode, 200);
  assert.equal(workspaces.json()[0].slug, "kori-default-workspace");

  const adminOverview = await app.inject({
    method: "GET",
    url: "/v1/admin/overview",
    headers: {
      "x-kori-session": session.sessionToken
    }
  });

  assert.equal(adminOverview.statusCode, 200);

  await app.close();
});

test("device config and rotate token routes require device auth", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const bootstrap = await app.inject({
    method: "POST",
    url: "/v1/device/bootstrap",
    payload: {
      hardwareId: "77:88:99:AA:BB:CC",
      userApiKey: "dev-user-api-key",
      deviceName: "Kori-Token",
      firmwareVersion: "0.4.0"
    }
  });

  const { deviceToken } = bootstrap.json();
  const config = await app.inject({
    method: "GET",
    url: "/v1/device/config",
    headers: {
      authorization: `Bearer ${deviceToken}`
    }
  });

  assert.equal(config.statusCode, 200);
  assert.equal(config.json().timerMethod, "pomodoro");

  const rotate = await app.inject({
    method: "POST",
    url: "/v1/device/token/rotate",
    headers: {
      authorization: `Bearer ${deviceToken}`
    }
  });

  assert.equal(rotate.statusCode, 200);
  assert.ok(typeof rotate.json().deviceToken === "string");

  await app.close();
});

test("notes deadlines recommendations and telemetry routes work with a session", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe123!"
    }
  });
  const sessionToken = login.json().sessionToken as string;

  const note = await app.inject({
    method: "POST",
    url: "/v1/notes",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      workspaceId: "ws_dev",
      title: "Research draft",
      type: "markdown",
      content: "# hello"
    }
  });
  assert.equal(note.statusCode, 201);

  const deadline = await app.inject({
    method: "POST",
    url: "/v1/deadlines",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      workspaceId: "ws_dev",
      title: "Submit outline",
      dueAt: "2026-12-31T23:59:00.000Z",
      metadata: {
        course: "capstone"
      }
    }
  });
  assert.equal(deadline.statusCode, 201);

  const recommendation = await app.inject({
    method: "POST",
    url: "/v1/recommendations",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      workspaceId: "ws_dev",
      type: "focus_nudge",
      title: "Take a reset",
      body: "Noise has been elevated."
    }
  });
  assert.equal(recommendation.statusCode, 201);

  const notes = await app.inject({
    method: "GET",
    url: "/v1/notes",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(notes.statusCode, 200);
  assert.equal(notes.json().length, 1);
  const noteId = notes.json()[0].id as string;

  const noteUpdate = await app.inject({
    method: "PATCH",
    url: `/v1/notes/${noteId}`,
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      content: "# revised"
    }
  });
  assert.equal(noteUpdate.statusCode, 200);
  assert.equal(noteUpdate.json().content, "# revised");

  const revisions = await app.inject({
    method: "GET",
    url: `/v1/notes/${noteId}/revisions`,
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(revisions.statusCode, 200);
  assert.equal(revisions.json().length, 2);

  const deadlines = await app.inject({
    method: "GET",
    url: "/v1/deadlines",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(deadlines.statusCode, 200);
  assert.equal(deadlines.json().length, 1);
  const deadlineId = deadlines.json()[0].id as string;

  const deadlineUpdate = await app.inject({
    method: "PATCH",
    url: `/v1/deadlines/${deadlineId}`,
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      status: "COMPLETED"
    }
  });
  assert.equal(deadlineUpdate.statusCode, 200);
  assert.equal(deadlineUpdate.json().status, "COMPLETED");

  const recommendations = await app.inject({
    method: "GET",
    url: "/v1/recommendations",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(recommendations.statusCode, 200);
  assert.equal(recommendations.json().length, 1);
  const recommendationId = recommendations.json()[0].id as string;

  const recommendationUpdate = await app.inject({
    method: "PATCH",
    url: `/v1/recommendations/${recommendationId}`,
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      deliveredAt: "2026-04-16T12:00:00.000Z"
    }
  });
  assert.equal(recommendationUpdate.statusCode, 200);
  assert.equal(recommendationUpdate.json().deliveredAt, "2026-04-16T12:00:00.000Z");

  const telemetry = await app.inject({
    method: "GET",
    url: "/v1/admin/telemetry",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(telemetry.statusCode, 200);
  assert.ok(Array.isArray(telemetry.json().buckets));

  await app.close();
});

test("admin contracts and filtered logs endpoints are available", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe123!"
    }
  });
  const sessionToken = login.json().sessionToken as string;

  await app.inject({
    method: "GET",
    url: "/v1/workspaces",
    headers: {
      "x-kori-session": sessionToken
    }
  });

  const contracts = await app.inject({
    method: "GET",
    url: "/v1/admin/contracts",
    headers: {
      "x-kori-session": sessionToken
    }
  });

  assert.equal(contracts.statusCode, 200);
  assert.ok(Array.isArray(contracts.json().rest));
  assert.equal(contracts.json().websocket.sessionPath, "/v1/ws/session");

  const logs = await app.inject({
    method: "GET",
    url: "/v1/admin/logs?route=/v1/workspaces&level=info",
    headers: {
      "x-kori-session": sessionToken
    }
  });

  assert.equal(logs.statusCode, 200);
  assert.ok(logs.json().every((entry: { route: string | null; level: string }) => entry.route === "/v1/workspaces"));

  await app.close();
});

test("security, connector, job, quota, and generated contract routes work", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe123!"
    }
  });
  const sessionToken = login.json().sessionToken as string;

  const enroll = await app.inject({
    method: "POST",
    url: "/v1/auth/mfa/enroll",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      type: "totp",
      label: "primary"
    }
  });
  assert.equal(enroll.statusCode, 200);
  const enrollBody = enroll.json();

  const verify = await app.inject({
    method: "POST",
    url: "/v1/auth/mfa/verify",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      factorId: enrollBody.factor.id,
      code: enrollBody.backupCodes[0]
    }
  });
  assert.equal(verify.statusCode, 200);

  const disable = await app.inject({
    method: "POST",
    url: "/v1/auth/mfa/disable",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      factorId: enrollBody.factor.id
    }
  });
  assert.equal(disable.statusCode, 200);

  const invitation = await app.inject({
    method: "POST",
    url: "/v1/auth/invitations",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      email: "owner@example.com",
      workspaceId: "ws_dev",
      role: "member",
      expiresInSec: 600
    }
  });
  assert.equal(invitation.statusCode, 201);
  const invitationToken = invitation.json().token as string;

  const acceptInvitation = await app.inject({
    method: "POST",
    url: "/v1/auth/invitations/test/accept",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      token: invitationToken
    }
  });
  assert.equal(acceptInvitation.statusCode, 200);
  assert.equal(acceptInvitation.json().status, "accepted");

  const revokedInvitation = await app.inject({
    method: "DELETE",
    url: `/v1/auth/invitations/${invitation.json().invitation.id}`,
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(revokedInvitation.statusCode, 200);

  const serviceToken = await app.inject({
    method: "POST",
    url: "/v1/service-tokens",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      label: "worker-access",
      workspaceId: "ws_dev"
    }
  });
  assert.equal(serviceToken.statusCode, 201);
  assert.ok(typeof serviceToken.json().rawToken === "string");

  const connectorConfig = await app.inject({
    method: "POST",
    url: "/v1/connectors/configs",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      provider: "crossref",
      workspaceId: "ws_dev",
      config: {
        apiKey: "top-secret-value"
      }
    }
  });
  assert.equal(connectorConfig.statusCode, 200);

  const connectorRun = await app.inject({
    method: "POST",
    url: "/v1/connectors/runs",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      provider: "crossref",
      workspaceId: "ws_dev"
    }
  });
  assert.equal(connectorRun.statusCode, 201);

  const jobs = await app.inject({
    method: "GET",
    url: "/v1/admin/jobs",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(jobs.statusCode, 200);
  assert.ok(jobs.json().length >= 1);

  const quotas = await app.inject({
    method: "GET",
    url: "/v1/admin/quotas",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(quotas.statusCode, 200);
  assert.equal(quotas.json()[0].workspaceId, "ws_dev");

  const openapi = await app.inject({
    method: "GET",
    url: "/v1/admin/contracts/openapi.json",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(openapi.statusCode, 200);
  assert.equal(openapi.json().openapi, "3.1.0");

  const asyncapi = await app.inject({
    method: "GET",
    url: "/v1/admin/contracts/asyncapi.json",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(asyncapi.statusCode, 200);
  assert.equal(asyncapi.json().asyncapi, "3.0.0");

  const logs = await app.inject({
    method: "GET",
    url: "/v1/admin/logs?integration=crossref",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(logs.statusCode, 200);

  const savedView = await app.inject({
    method: "POST",
    url: "/v1/admin/dashboard-views",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      workspaceId: "ws_dev",
      name: "Ops view",
      filters: {
        route: "/v1/admin/jobs"
      }
    }
  });
  assert.equal(savedView.statusCode, 201);

  const savedViews = await app.inject({
    method: "GET",
    url: "/v1/admin/dashboard-views",
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(savedViews.statusCode, 200);
  assert.equal(savedViews.json().length, 1);

  const consoleRun = await app.inject({
    method: "POST",
    url: "/v1/admin/test-console",
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      method: "GET",
      path: "/v1/admin/overview"
    }
  });
  assert.equal(consoleRun.statusCode, 200);
  assert.equal(consoleRun.json().ok, true);

  await app.close();
});

test("password reset flow returns a preview token in test mode and creates a new session", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const forgot = await app.inject({
    method: "POST",
    url: "/v1/auth/password/forgot",
    payload: {
      email: "owner@example.com"
    }
  });
  assert.equal(forgot.statusCode, 200);
  const forgotBody = forgot.json();
  assert.equal(forgotBody.ok, true);
  assert.ok(typeof forgotBody.resetToken === "string");

  const reset = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset",
    payload: {
      token: forgotBody.resetToken,
      password: "ChangeMe456!"
    }
  });
  assert.equal(reset.statusCode, 200);
  assert.ok(typeof reset.json().sessionToken === "string");

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe456!"
    }
  });
  assert.equal(login.statusCode, 200);

  await app.close();
});

test("admin device actions revoke, reprovision, update config, and mark offline", async () => {
  const app = await buildServer({
    env: baseEnv
  });

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      email: "owner@example.com",
      password: "ChangeMe123!"
    }
  });
  const sessionToken = login.json().sessionToken as string;

  const bootstrap = await app.inject({
    method: "POST",
    url: "/v1/device/bootstrap",
    payload: {
      hardwareId: "22:33:44:55:66:77",
      userApiKey: "dev-user-api-key",
      deviceName: "Kori-Admin",
      firmwareVersion: "0.5.0"
    }
  });
  const deviceId = bootstrap.json().deviceId as string;

  const configUpdate = await app.inject({
    method: "POST",
    url: `/v1/admin/devices/${deviceId}/config`,
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      telemetryIntervalSec: 5,
      timerMethod: "focus"
    }
  });
  assert.equal(configUpdate.statusCode, 200);
  assert.equal(configUpdate.json().action, "config_update");

  const revoke = await app.inject({
    method: "POST",
    url: `/v1/admin/devices/${deviceId}/revoke`,
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      reason: "rotation"
    }
  });
  assert.equal(revoke.statusCode, 200);

  const reprovision = await app.inject({
    method: "POST",
    url: `/v1/admin/devices/${deviceId}/reprovision`,
    headers: {
      "x-kori-session": sessionToken
    }
  });
  assert.equal(reprovision.statusCode, 200);
  assert.ok(typeof reprovision.json().deviceToken === "string");

  const offline = await app.inject({
    method: "POST",
    url: `/v1/admin/devices/${deviceId}/mark-offline`,
    headers: {
      "x-kori-session": sessionToken
    },
    payload: {
      reason: "maintenance"
    }
  });
  assert.equal(offline.statusCode, 200);
  assert.equal(offline.json().action, "mark_offline");

  await app.close();
});
