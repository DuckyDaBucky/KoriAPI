import type { FastifyPluginAsync } from "fastify";
import websocket from "@fastify/websocket";
import { attachDeviceSocket } from "../ws/device-runtime.js";
import { attachSessionSocket } from "../ws/session-runtime.js";

const wsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(websocket);

  app.get(
    "/v1/ws/device",
    { websocket: true },
    async (socket, request) => {
      await attachDeviceSocket(app, socket, {
        headers: request.headers as Record<string, string | string[] | undefined>
      });
    }
  );

  app.get(
    "/v1/ws/session",
    { websocket: true },
    async (socket, request) => {
      await attachSessionSocket(app, socket, {
        headers: request.headers as Record<string, string | string[] | undefined>,
        url: request.raw.url ?? "/v1/ws/session"
      });
    }
  );
};

export default wsRoutes;
