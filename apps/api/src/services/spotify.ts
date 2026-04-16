import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { createDbClient, schema } from "@kori/db";
import type { AppEnv } from "../config/env.js";
import { decryptString, encryptString } from "../utils/crypto.js";
import type { ObservabilityService, SpotifyConnectionStatus, SpotifyService } from "./types.js";

function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

type SpotifyProfileResponse = {
  id: string;
};

type SpotifyPlaybackResponse = {
  is_playing: boolean;
  progress_ms: number | null;
  item: null | {
    id: string | null;
    name: string;
    album: { name: string };
    artists: Array<{ name: string }>;
  };
  device?: {
    name?: string;
  };
  timestamp?: number;
};

export function encodeSpotifyState(userId: string, env: AppEnv): string {
  return encodeURIComponent(
    encryptString(
      JSON.stringify({
        userId,
        issuedAt: Date.now()
      }),
      env.APP_ENCRYPTION_KEY
    )
  );
}

export function decodeSpotifyState(rawState: string, env: AppEnv): { userId: string } {
  const parsed = JSON.parse(decryptString(decodeURIComponent(rawState), env.APP_ENCRYPTION_KEY)) as {
    userId: string;
    issuedAt: number;
  };

  return { userId: parsed.userId };
}

export class SpotifyHttpService implements SpotifyService {
  constructor(
    private readonly env: AppEnv,
    private readonly observabilityService: ObservabilityService
  ) {}

  async getAuthorizationUrl(userId: string): Promise<string> {
    if (!this.env.SPOTIFY_CLIENT_ID || !this.env.SPOTIFY_REDIRECT_URI) {
      throw new Error("SPOTIFY_NOT_CONFIGURED");
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.env.SPOTIFY_CLIENT_ID,
      scope: this.env.SPOTIFY_SCOPES,
      redirect_uri: this.env.SPOTIFY_REDIRECT_URI,
      state: encodeSpotifyState(userId, this.env)
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async handleCallback(input: { userId: string; code: string }): Promise<SpotifyConnectionStatus> {
    const tokenResponse = await this.exchangeAuthorizationCode(input.code);
    const profile = await this.fetchSpotifyProfile(tokenResponse.access_token);
    const db = createDbClient();
    const refreshToken = tokenResponse.refresh_token;

    if (!refreshToken) {
      throw new Error("SPOTIFY_REFRESH_TOKEN_MISSING");
    }

    const encryptedRefreshToken = encryptString(refreshToken, this.env.APP_ENCRYPTION_KEY);
    const existing = await db.query.spotifyConnections.findFirst({
      where: eq(schema.spotifyConnections.userId, input.userId)
    });

    if (existing) {
      await db
        .update(schema.spotifyConnections)
        .set({
          spotifyUserId: profile.id,
          refreshTokenEnc: encryptedRefreshToken,
          scopes: tokenResponse.scope,
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(schema.spotifyConnections.userId, input.userId));
    } else {
      await db.insert(schema.spotifyConnections).values({
        id: createId("spc"),
        userId: input.userId,
        spotifyUserId: profile.id,
        refreshTokenEnc: encryptedRefreshToken,
        scopes: tokenResponse.scope
      });
    }

    return this.getStatus(input.userId);
  }

  async disconnect(userId: string): Promise<void> {
    const db = createDbClient();
    await db
      .update(schema.spotifyConnections)
      .set({
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(schema.spotifyConnections.userId, userId));
  }

  async getStatus(userId: string): Promise<SpotifyConnectionStatus> {
    const db = createDbClient();
    const connection = await db.query.spotifyConnections.findFirst({
      where: eq(schema.spotifyConnections.userId, userId)
    });
    const latestPresence = await db.query.spotifyPresenceEvents.findFirst({
      where: eq(schema.spotifyPresenceEvents.userId, userId),
      orderBy: desc(schema.spotifyPresenceEvents.observedAt)
    });

    return {
      connected: Boolean(connection?.isActive),
      userId,
      spotifyUserId: connection?.spotifyUserId ?? null,
      scopes: connection?.scopes ? connection.scopes.split(" ").filter(Boolean) : [],
      lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
      presence: latestPresence
        ? {
            userId,
            isPlaying: latestPresence.isPlaying,
            trackId: latestPresence.trackId ?? null,
            trackName: latestPresence.trackName ?? null,
            artistNames: latestPresence.artistNames,
            albumName: latestPresence.albumName ?? null,
            startedAt: latestPresence.observedAt.toISOString(),
            progressMs: latestPresence.progressMs ?? null,
            deviceName: latestPresence.deviceName ?? null,
            observedAt: latestPresence.observedAt.toISOString(),
            source: "spotify"
          }
        : null
    };
  }

  async refreshPresence(userId: string) {
    const db = createDbClient();
    const connection = await db.query.spotifyConnections.findFirst({
      where: and(eq(schema.spotifyConnections.userId, userId), eq(schema.spotifyConnections.isActive, true))
    });

    if (!connection) {
      return null;
    }

    const refreshToken = decryptString(connection.refreshTokenEnc, this.env.APP_ENCRYPTION_KEY);
    const tokenResponse = await this.refreshAccessToken(refreshToken);
    const playback = await this.fetchCurrentlyPlaying(tokenResponse.access_token);

    if (!playback) {
      return null;
    }

    const observedAt = new Date().toISOString();
    const presence = {
      userId,
      isPlaying: playback.is_playing,
      trackId: playback.item?.id ?? null,
      trackName: playback.item?.name ?? null,
      artistNames: playback.item?.artists.map((artist) => artist.name) ?? [],
      albumName: playback.item?.album.name ?? null,
      startedAt: playback.timestamp ? new Date(playback.timestamp).toISOString() : null,
      progressMs: playback.progress_ms ?? null,
      deviceName: playback.device?.name ?? null,
      observedAt,
      source: "spotify" as const
    };

    await db.insert(schema.spotifyPresenceEvents).values({
      id: createId("spe"),
      userId,
      isPlaying: presence.isPlaying,
      trackId: presence.trackId,
      trackName: presence.trackName,
      albumName: presence.albumName,
      artistNames: presence.artistNames,
      progressMs: presence.progressMs,
      deviceName: presence.deviceName
    });

    await db
      .update(schema.spotifyConnections)
      .set({
        lastSyncedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.spotifyConnections.userId, userId));

    await this.observabilityService.setSpotifyPresence(presence);

    return presence;
  }

  private async exchangeAuthorizationCode(code: string): Promise<SpotifyTokenResponse> {
    if (!this.env.SPOTIFY_CLIENT_ID || !this.env.SPOTIFY_CLIENT_SECRET || !this.env.SPOTIFY_REDIRECT_URI) {
      throw new Error("SPOTIFY_NOT_CONFIGURED");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.env.SPOTIFY_REDIRECT_URI
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.env.SPOTIFY_CLIENT_ID}:${this.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error("SPOTIFY_TOKEN_EXCHANGE_FAILED");
    }

    return (await response.json()) as SpotifyTokenResponse;
  }

  private async refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
    if (!this.env.SPOTIFY_CLIENT_ID || !this.env.SPOTIFY_CLIENT_SECRET) {
      throw new Error("SPOTIFY_NOT_CONFIGURED");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.env.SPOTIFY_CLIENT_ID}:${this.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error("SPOTIFY_REFRESH_FAILED");
    }

    return (await response.json()) as SpotifyTokenResponse;
  }

  private async fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfileResponse> {
    const response = await fetch("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error("SPOTIFY_PROFILE_FETCH_FAILED");
    }

    return (await response.json()) as SpotifyProfileResponse;
  }

  private async fetchCurrentlyPlaying(accessToken: string): Promise<SpotifyPlaybackResponse | null> {
    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new Error("SPOTIFY_CURRENTLY_PLAYING_FAILED");
    }

    return (await response.json()) as SpotifyPlaybackResponse;
  }
}
