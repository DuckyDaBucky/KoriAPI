import type { LiveStateService, RedisClient } from "./types.js";

export class RedisLiveStateService implements LiveStateService {
  constructor(private readonly redis: RedisClient) {}

  async getDeviceState(deviceId: string): Promise<Record<string, unknown> | null> {
    const raw = await this.redis.get(`kori:device:${deviceId}:state`);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }

  async setDeviceState(deviceId: string, state: Record<string, unknown>): Promise<void> {
    await this.redis.set(`kori:device:${deviceId}:state`, JSON.stringify(state), "EX", 900);
  }

  async removeDeviceSession(deviceId: string): Promise<void> {
    await this.redis.del(`kori:device:${deviceId}:session`);
  }

  async setDeviceSession(deviceId: string, state: Record<string, unknown>): Promise<void> {
    await this.redis.set(`kori:device:${deviceId}:session`, JSON.stringify(state), "EX", 3600);
  }
}
