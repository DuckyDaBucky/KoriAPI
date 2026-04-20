import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type {
  AuditService,
  AuthService,
  BootstrapService,
  ConnectorsService,
  DeadlinesService,
  DeviceAuthService,
  DeviceRegistryService,
  DashboardViewsService,
  HealthService,
  JobsService,
  LiveStateService,
  MailService,
  NotesService,
  NotificationEventService,
  ObservabilityService,
  ProvisioningCodeService,
  QuotasService,
  RecommendationsService,
  SecurityService,
  SensorIngestionService,
  SpotifyService,
  TelemetryService,
  TemporalService,
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
  mailService: MailService;
  notesService: NotesService;
  sensorIngestionService: SensorIngestionService;
  notificationEventService: NotificationEventService;
  auditService: AuditService;
  connectorsService: ConnectorsService;
  jobsService: JobsService;
  observabilityService: ObservabilityService;
  quotasService: QuotasService;
  recommendationsService: RecommendationsService;
  securityService: SecurityService;
  spotifyService: SpotifyService;
  telemetryService: TelemetryService;
  temporalService: TemporalService;
  dashboardViewsService: DashboardViewsService;
}

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
  }
}

const servicesPlugin: FastifyPluginAsync<{ services: AppServices }> = async (app, options) => {
  app.decorate("services", options.services);
};

export default fp(servicesPlugin);
