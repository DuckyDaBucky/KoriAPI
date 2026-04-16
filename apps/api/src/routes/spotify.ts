import type { FastifyPluginAsync } from "fastify";
import { spotifyConnectionStatusSchema, spotifyPresenceSchema } from "@kori/shared";
import { decodeSpotifyState } from "../services/spotify.js";
import { requireAdmin } from "../utils/admin-auth.js";

function getUserIdFromRequest(request: {
  query?: Record<string, unknown> | undefined;
  body?: Record<string, unknown> | undefined;
}): string | null {
  const queryUserId = request.query?.userId;
  if (typeof queryUserId === "string" && queryUserId.length > 0) {
    return queryUserId;
  }

  const bodyUserId = request.body?.userId;
  return typeof bodyUserId === "string" && bodyUserId.length > 0 ? bodyUserId : null;
}

const spotifyRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/integrations/spotify/connect", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const userId = getUserIdFromRequest({ query: request.query as Record<string, unknown> | undefined });
    if (!userId) {
      return reply.code(400).send({
        error: {
          code: "MISSING_USER_ID",
          message: "userId is required"
        }
      });
    }

    const url = await app.services.spotifyService.getAuthorizationUrl(userId);
    return { url };
  });

  app.get("/v1/integrations/spotify/callback", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const code = query.code;
    const state = query.state;

    if (!code || !state) {
      return reply.code(400).send({
        error: {
          code: "SPOTIFY_CALLBACK_INVALID",
          message: "Spotify callback is missing required parameters"
        }
      });
    }

    const { userId } = decodeSpotifyState(state, app.config);
    const status = await app.services.spotifyService.handleCallback({ userId, code });
    await app.services.auditService.record({
      action: "spotify.connected",
      actorType: "admin",
      actorId: "spotify_oauth_callback",
      workspaceId: null,
      userId,
      resourceType: "spotify_connection",
      resourceId: userId,
      metadata: {
        spotifyUserId: status.spotifyUserId
      }
    });

    return reply.type("text/html").send(`
      <!doctype html>
      <html lang="en">
      <head><meta charset="utf-8"><title>Kori Spotify Linked</title></head>
      <body style="font-family: sans-serif; background: #111827; color: #f8fafc; padding: 2rem;">
        <h1>Spotify linked</h1>
        <p>User <code>${userId}</code> is now connected.</p>
        <p>You can close this window and return to the Kori dashboard.</p>
      </body>
      </html>
    `);
  });

  app.get("/v1/integrations/spotify/status", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const userId = getUserIdFromRequest({ query: request.query as Record<string, unknown> | undefined });
    if (!userId) {
      return reply.code(400).send({
        error: {
          code: "MISSING_USER_ID",
          message: "userId is required"
        }
      });
    }

    return spotifyConnectionStatusSchema.parse(await app.services.spotifyService.getStatus(userId));
  });

  app.post("/v1/integrations/spotify/presence", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const userId = getUserIdFromRequest({
      query: request.query as Record<string, unknown> | undefined,
      body: request.body as Record<string, unknown> | undefined
    });
    if (!userId) {
      return reply.code(400).send({
        error: {
          code: "MISSING_USER_ID",
          message: "userId is required"
        }
      });
    }

    const presence = await app.services.spotifyService.refreshPresence(userId);
    if (!presence) {
      return { connected: false, presence: null };
    }

    return spotifyPresenceSchema.parse(presence);
  });

  app.post("/v1/integrations/spotify/disconnect", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const userId = getUserIdFromRequest({
      query: request.query as Record<string, unknown> | undefined,
      body: request.body as Record<string, unknown> | undefined
    });
    if (!userId) {
      return reply.code(400).send({
        error: {
          code: "MISSING_USER_ID",
          message: "userId is required"
        }
      });
    }

    await app.services.spotifyService.disconnect(userId);
    await app.services.auditService.record({
      action: "spotify.disconnected",
      actorType: "admin",
      actorId: "admin",
      workspaceId: null,
      userId,
      resourceType: "spotify_connection",
      resourceId: userId,
      metadata: {}
    });

    return { ok: true };
  });
};

export default spotifyRoutes;
