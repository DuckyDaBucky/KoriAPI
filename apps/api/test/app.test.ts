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

  const codeResponse = await app.inject({
    method: "POST",
    url: "/v1/admin/provisioning-codes",
    headers: {
      "x-kori-admin-key": baseEnv.ADMIN_API_KEY
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

test("admin overview requires admin key", async () => {
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

  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.json().counts.devices, 0);

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
