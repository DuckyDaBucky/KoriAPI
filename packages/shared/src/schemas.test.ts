import test from "node:test";
import assert from "node:assert/strict";
import {
  bootstrapRequestSchema,
  inboundEnvelopeSchema,
  provisioningCodeRequestSchema,
  wsEventTypes
} from "./index.js";

test("bootstrap request schema accepts valid bootstrap input", () => {
  const parsed = bootstrapRequestSchema.parse({
    hardwareId: "AA:BB:CC:DD:EE:FF",
    userApiKey: "dev-user-api-key",
    deviceName: "Kori-CYD",
    firmwareVersion: "0.2.0"
  });

  assert.equal(parsed.deviceName, "Kori-CYD");
});

test("provisioning code request schema accepts valid input", () => {
  const parsed = provisioningCodeRequestSchema.parse({
    workspaceId: "ws_dev",
    userId: "user_dev",
    expiresInSec: 600,
    label: "lab-device"
  });

  assert.equal(parsed.workspaceId, "ws_dev");
});

test("inbound sensor envelope parses device telemetry", () => {
  const parsed = inboundEnvelopeSchema.parse({
    type: wsEventTypes.deviceSensors,
    ts: 1711843200,
    payload: {
      deviceId: "dev_1",
      token: "opaque-token",
      ts: 1711843200,
      sensors: {
        temp: 24,
        humidity: 50,
        pressure: 1001,
        co2: 850,
        tvoc: 100,
        noise: 35,
        light: 44
      },
      health: {
        wifi: "ok",
        bme280: "ok",
        ccs811: "ok"
      }
    }
  });

  assert.equal(parsed.type, wsEventTypes.deviceSensors);
  assert.equal(parsed.payload.sensors.co2, 850);
});
