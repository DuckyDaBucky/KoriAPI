import { randomUUID } from "node:crypto";
import type { AuditEvent, DeviceLiveState, DeveloperLogEvent, SpotifyPresence } from "@kori/shared";
import type {
  AdminStreamEvent,
  AuditService,
  ObservabilityService,
} from "./types.js";

export class MemoryAuditService implements AuditService {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly observabilityService?: ObservabilityService) {}

  async record(event: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string }): Promise<AuditEvent> {
    const entry: AuditEvent = {
      ...event,
      id: `audit_${randomUUID().replaceAll("-", "")}`,
      createdAt: event.createdAt ?? new Date().toISOString()
    };
    this.events.unshift(entry);
    this.events.splice(200);
    if (this.observabilityService) {
      await this.observabilityService.publish({ type: "admin:audit", payload: entry });
    }
    return entry;
  }

  async listRecent(limit = 50): Promise<AuditEvent[]> {
    return this.events.slice(0, limit);
  }
}

export class MemoryObservabilityService implements ObservabilityService {
  private readonly logs: DeveloperLogEvent[] = [];
  private readonly deviceStates = new Map<string, DeviceLiveState>();
  private readonly spotifyPresence = new Map<string, SpotifyPresence>();
  private readonly subscribers = new Set<(event: AdminStreamEvent) => void>();

  async log(event: Omit<DeveloperLogEvent, "id" | "createdAt"> & { createdAt?: string }): Promise<DeveloperLogEvent> {
    const entry: DeveloperLogEvent = {
      ...event,
      id: `log_${randomUUID().replaceAll("-", "")}`,
      createdAt: event.createdAt ?? new Date().toISOString()
    };
    this.logs.unshift(entry);
    this.logs.splice(500);
    this.emit({ type: "admin:log", payload: entry });
    return entry;
  }

  async publish(event: AdminStreamEvent): Promise<void> {
    this.emit(event);
  }

  async listLogs(limit = 100): Promise<DeveloperLogEvent[]> {
    return this.logs.slice(0, limit);
  }

  async setDeviceState(state: DeviceLiveState): Promise<void> {
    this.deviceStates.set(state.deviceId, state);
    this.emit({ type: "admin:device_state", payload: state });
  }

  async removeDeviceState(deviceId: string): Promise<void> {
    const previous = this.deviceStates.get(deviceId);
    if (!previous) {
      return;
    }

    const nextState: DeviceLiveState = {
      ...previous,
      connected: false
    };
    this.deviceStates.set(deviceId, nextState);
    this.emit({ type: "admin:device_state", payload: nextState });
  }

  async listDeviceStates(): Promise<DeviceLiveState[]> {
    return [...this.deviceStates.values()]
      .map((state) => ({
        ...state,
        lastSeenAt: state.lastSeenAt ?? state.connectedAt
      }))
      .sort((left, right) => (right.lastSeenAt ?? "").localeCompare(left.lastSeenAt ?? ""));
  }

  async setSpotifyPresence(presence: SpotifyPresence): Promise<void> {
    this.spotifyPresence.set(presence.userId, presence);
    this.emit({ type: "admin:spotify_presence", payload: presence });
  }

  async listSpotifyPresence(): Promise<SpotifyPresence[]> {
    return [...this.spotifyPresence.values()].sort((left, right) => right.observedAt.localeCompare(left.observedAt));
  }

  subscribe(listener: (event: AdminStreamEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private emit(event: AdminStreamEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }
}
