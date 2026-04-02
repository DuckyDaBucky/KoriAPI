import type { FastifyPluginAsync } from "fastify";
import websocket from "@fastify/websocket";
import { attachDeviceSocket } from "../ws/device-runtime.js";

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
};

export default wsRoutes;
