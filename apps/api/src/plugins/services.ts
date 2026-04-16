import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type {
  AuditService,
  AuthService,
  BootstrapService,
  DeadlinesService,
  DeviceAuthService,
  DeviceRegistryService,
  HealthService,
  LiveStateService,
  NotesService,
  NotificationEventService,
  ObservabilityService,
  ProvisioningCodeService,
  RecommendationsService,
  SensorIngestionService,
  SpotifyService,
  TelemetryService,
  WorkspaceService
} from "../services/types.js";

export interface AppServices {
  authService: AuthService;
  bootstrapService: BootstrapService;
  deadlinesService: DeadlinesService;
  deviceAuthService: DeviceAuthService;
  deviceRegistryService: DeviceRegistryService;
  workspaceService: WorkspaceService;
  provisioningCodeService: ProvisioningCodeService;
  healthService: HealthService;
  liveStateService: LiveStateService;
  notesService: NotesService;
  sensorIngestionService: SensorIngestionService;
  notificationEventService: NotificationEventService;
  auditService: AuditService;
  observabilityService: ObservabilityService;
  recommendationsService: RecommendationsService;
  spotifyService: SpotifyService;
  telemetryService: TelemetryService;
}

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
    betterAuthStub: {
      enabled: boolean;
      baseUrl?: string | undefined;
    };
  }
}

const servicesPlugin: FastifyPluginAsync<{ services: AppServices }> = async (app, options) => {
  app.decorate("services", options.services);
};

export default fp(servicesPlugin);
