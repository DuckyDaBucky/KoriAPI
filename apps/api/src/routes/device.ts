import type { FastifyPluginAsync } from "fastify";
import {
  bootstrapRequestSchema,
  bootstrapResponseSchema,
  deviceConfigSchema,
  deviceTokenRotateResponseSchema
} from "@kori/shared";

function getBearerToken(header?: string): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim() || null;
}

const deviceRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/device/bootstrap", async (request, reply) => {
    const body = bootstrapRequestSchema.parse(request.body);

    try {
      const result = await app.services.bootstrapService.bootstrap({
        hardwareId: body.hardwareId,
        deviceName: body.deviceName,
        firmwareVersion: body.firmwareVersion,
        wsUrl: app.config.PUBLIC_WS_URL,
        ...(body.userApiKey !== undefined ? { userApiKey: body.userApiKey } : {}),
        ...(body.provisioningCode !== undefined ? { provisioningCode: body.provisioningCode } : {})
      });

      return reply.code(201).send(bootstrapResponseSchema.parse(result));
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_DEVICE_BOOTSTRAP_CREDENTIAL") {
        return reply.code(401).send({
          error: {
            code: "INVALID_DEVICE_BOOTSTRAP_CREDENTIAL",
            message: "Invalid device bootstrap credential"
          }
        });
      }

      throw error;
    }
  });

  app.post("/v1/device/token/rotate", async (request, reply) => {
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({
        error: {
          code: "MISSING_DEVICE_TOKEN",
          message: "Bearer device token is required"
        }
      });
    }

    const device = await app.services.deviceAuthService.authenticateToken(token);
    if (!device) {
      return reply.code(401).send({
        error: {
          code: "INVALID_DEVICE_TOKEN",
          message: "Device token is invalid or expired"
        }
      });
    }

    const rotated = await app.services.deviceRegistryService.rotateToken({ deviceId: device.id });
    await app.services.auditService.record({
      action: "device.token_rotated",
      actorType: "device",
      actorId: device.id,
      workspaceId: device.workspaceId,
      userId: device.userId,
      resourceType: "device",
      resourceId: device.id,
      metadata: {
        expiresAt: rotated.expiresAt
      }
    });

    return deviceTokenRotateResponseSchema.parse({
      deviceToken: rotated.token,
      expiresAt: rotated.expiresAt,
      rotatedAt: rotated.rotatedAt
    });
  });

  app.get("/v1/device/config", async (request, reply) => {
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
      return reply.code(401).send({
        error: {
          code: "MISSING_DEVICE_TOKEN",
          message: "Bearer device token is required"
        }
      });
    }

    const device = await app.services.deviceAuthService.authenticateToken(token);
    if (!device) {
      return reply.code(401).send({
        error: {
          code: "INVALID_DEVICE_TOKEN",
          message: "Device token is invalid or expired"
        }
      });
    }

    const config = await app.services.deviceRegistryService.getDeviceConfig(device.id);
    return deviceConfigSchema.parse(config);
  });
};

export default deviceRoutes;
