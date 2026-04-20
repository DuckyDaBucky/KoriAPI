import nodemailer from "nodemailer";
import type { AppEnv } from "../config/env.js";
import type { MailService, ObservabilityService } from "./types.js";

function buildBaseUrl(env: AppEnv): string {
  return env.BETTER_AUTH_BASE_URL ?? `http://localhost:${env.PORT}`;
}

function invitationUrl(env: AppEnv, token: string): string {
  const url = new URL("/login", buildBaseUrl(env));
  url.searchParams.set("invitationToken", token);
  return url.toString();
}

function passwordResetUrl(env: AppEnv, token: string): string {
  const url = new URL("/login", buildBaseUrl(env));
  url.searchParams.set("resetToken", token);
  return url.toString();
}

export class MemoryMailService implements MailService {
  constructor(private readonly observabilityService?: ObservabilityService) {}

  async sendPasswordReset(input: {
    email: string;
    resetToken: string;
    expiresAt: string;
  }): Promise<void> {
    await this.observabilityService?.log({
      level: "info",
      message: `password reset email queued for ${input.email}`,
      route: null,
      method: null,
      requestId: null,
      statusCode: null,
      workspaceId: null,
      userId: null,
      deviceId: null,
      integration: "smtp",
      metadata: {
        email: input.email,
        expiresAt: input.expiresAt,
        resetToken: input.resetToken
      }
    });
  }

  async sendInvitation(input: {
    email: string;
    workspaceId: string;
    role: "workspace_admin" | "member" | "service";
    token: string;
    expiresAt: string;
  }): Promise<void> {
    await this.observabilityService?.log({
      level: "info",
      message: `invitation email queued for ${input.email}`,
      route: null,
      method: null,
      requestId: null,
      statusCode: null,
      workspaceId: input.workspaceId,
      userId: null,
      deviceId: null,
      integration: "smtp",
      metadata: {
        email: input.email,
        role: input.role,
        expiresAt: input.expiresAt,
        token: input.token
      }
    });
  }
}

export class SmtpMailService implements MailService {
  private readonly transporter;

  constructor(
    private readonly env: AppEnv,
    private readonly observabilityService?: ObservabilityService
  ) {
    if (!env.SMTP_HOST || !env.SMTP_FROM) {
      throw new Error("SMTP_NOT_CONFIGURED");
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          }
        : undefined
    });
  }

  async sendPasswordReset(input: {
    email: string;
    resetToken: string;
    expiresAt: string;
  }): Promise<void> {
    const resetUrl = passwordResetUrl(this.env, input.resetToken);
    await this.transporter.sendMail({
      from: this.env.SMTP_FROM,
      to: input.email,
      subject: "KoriAPI password reset",
      text: `Reset your password before ${input.expiresAt}: ${resetUrl}`,
      html: `<p>Reset your password before <strong>${input.expiresAt}</strong>.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    });

    await this.observabilityService?.log({
      level: "info",
      message: `password reset email sent to ${input.email}`,
      route: null,
      method: null,
      requestId: null,
      statusCode: null,
      workspaceId: null,
      userId: null,
      deviceId: null,
      integration: "smtp",
      metadata: {
        email: input.email,
        expiresAt: input.expiresAt
      }
    });
  }

  async sendInvitation(input: {
    email: string;
    workspaceId: string;
    role: "workspace_admin" | "member" | "service";
    token: string;
    expiresAt: string;
  }): Promise<void> {
    const url = invitationUrl(this.env, input.token);
    await this.transporter.sendMail({
      from: this.env.SMTP_FROM,
      to: input.email,
      subject: `KoriAPI invitation to ${input.workspaceId}`,
      text: `You were invited to workspace ${input.workspaceId} as ${input.role}. Accept before ${input.expiresAt}: ${url}`,
      html: `<p>You were invited to workspace <strong>${input.workspaceId}</strong> as <strong>${input.role}</strong>.</p><p>Accept before ${input.expiresAt}: <a href="${url}">${url}</a></p>`
    });

    await this.observabilityService?.log({
      level: "info",
      message: `invitation email sent to ${input.email}`,
      route: null,
      method: null,
      requestId: null,
      statusCode: null,
      workspaceId: input.workspaceId,
      userId: null,
      deviceId: null,
      integration: "smtp",
      metadata: {
        email: input.email,
        role: input.role,
        expiresAt: input.expiresAt
      }
    });
  }
}
