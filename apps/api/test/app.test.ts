import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/app.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/koriapi?schema=public",
  REDIS_URL: "redis://localhost:6379",
  PUBLIC_WS_URL: "ws://localhost:3001/v1/ws/device"
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
  assert.ok(typeof body.serverTime === "number");

  await app.close();
});

test("bootstrap rejects invalid user api key", async () => {
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
