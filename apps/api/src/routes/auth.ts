import type { FastifyPluginAsync } from "fastify";
import {
  authLoginRequestSchema,
  authRegisterRequestSchema,
  authSessionResponseSchema,
  invitationAcceptRequestSchema,
  invitationCreateRequestSchema,
  invitationCreateResponseSchema,
  invitationSchema,
  mfaEnrollRequestSchema,
  mfaEnrollResponseSchema,
  mfaFactorSchema,
  mfaVerifyRequestSchema,
  passwordResetForgotRequestSchema,
  passwordResetForgotResponseSchema,
  passwordResetRequestSchema
} from "@kori/shared";
import {
  clearSessionCookies,
  ensureAdminWorkspaceAccess,
  extractSessionToken,
  requireAdminSession,
  requireUserSession,
  setSessionCookies
} from "../utils/admin-auth.js";

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/auth/register", async (request, reply) => {
    const body = authRegisterRequestSchema.parse(request.body);

    try {
      const session = await app.services.authService.register({
        email: body.email,
        password: body.password,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.workspaceName !== undefined ? { workspaceName: body.workspaceName } : {})
      });

      await app.services.auditService.record({
        action: "auth.register",
        actorType: "user",
        actorId: session.user.id,
        workspaceId: session.user.workspaces[0]?.id ?? null,
        userId: session.user.id,
        resourceType: "user",
        resourceId: session.user.id,
        metadata: {
          email: session.user.email
        }
      });

      setSessionCookies(reply, session);
      return reply.code(201).send(authSessionResponseSchema.parse(session));
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
        return reply.code(409).send({
          error: {
            code: "EMAIL_ALREADY_EXISTS",
            message: "An account with that email already exists"
          }
        });
      }

      throw error;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const body = authLoginRequestSchema.parse(request.body);
    const session = await app.services.authService.login(body);

    if (!session) {
      return reply.code(401).send({
        error: {
          code: "INVALID_LOGIN",
          message: "Email or password is incorrect"
        }
      });
    }

    await app.services.auditService.record({
      action: "auth.login",
      actorType: "user",
      actorId: session.user.id,
      workspaceId: session.user.workspaces[0]?.id ?? null,
      userId: session.user.id,
      resourceType: "session",
      resourceId: null,
      metadata: {}
    });

    setSessionCookies(reply, session);
    return authSessionResponseSchema.parse(session);
  });

  app.get("/v1/auth/session", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    return authSessionResponseSchema.parse(session);
  });

  app.post("/v1/auth/mfa/enroll", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const body = mfaEnrollRequestSchema.parse(request.body);
    const result = await app.services.securityService.enrollTotp({
      userId: session.user.id,
      email: session.user.email,
      ...(body.label !== undefined ? { label: body.label } : {})
    });

    await app.services.auditService.record({
      action: "auth.mfa.enroll",
      actorType: "user",
      actorId: session.user.id,
      workspaceId: session.user.workspaces[0]?.id ?? null,
      userId: session.user.id,
      resourceType: "mfa_factor",
      resourceId: result.factor.id,
      metadata: {
        type: result.factor.type,
        label: result.factor.label
      }
    });

    return mfaEnrollResponseSchema.parse(result);
  });

  app.post("/v1/auth/mfa/verify", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const body = mfaVerifyRequestSchema.parse(request.body);
    const verified = await app.services.securityService.verifyMfaFactor({
      userId: session.user.id,
      factorId: body.factorId,
      code: body.code
    });
    if (!verified) {
      return reply.code(400).send({
        error: {
          code: "MFA_INVALID_CODE",
          message: "Verification code is invalid"
        }
      });
    }

    return {
      ok: true
    };
  });

  app.post("/v1/auth/mfa/disable", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const body = mfaVerifyRequestSchema.pick({ factorId: true }).parse(request.body);
    const disabled = await app.services.securityService.disableMfaFactor({
      userId: session.user.id,
      factorId: body.factorId
    });
    if (!disabled) {
      return reply.code(404).send({
        error: {
          code: "MFA_NOT_FOUND",
          message: "MFA factor was not found"
        }
      });
    }

    return { ok: true };
  });

  app.get("/v1/auth/invitations", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const invitations = await app.services.securityService.listInvitations(
      adminSession.role === "workspace_admin" ? { workspaceIds: adminSession.workspaceIds } : {}
    );
    return invitations.map((invitation) => invitationSchema.parse(invitation));
  });

  app.post("/v1/auth/invitations", async (request, reply) => {
    const adminSession = await requireAdminSession(request, reply);
    if (!adminSession) {
      return;
    }

    const body = invitationCreateRequestSchema.parse(request.body);
    if (!ensureAdminWorkspaceAccess(adminSession, body.workspaceId, reply)) {
      return;
    }

    const invitation = await app.services.securityService.createInvitation({
      email: body.email,
      workspaceId: body.workspaceId,
      role: body.role,
      expiresInSec: body.expiresInSec,
      invitedByUserId: adminSession.actorId === "admin_api_key" ? null : adminSession.actorId
    });

    await app.services.auditService.record({
      action: "auth.invitation.create",
      actorType: "admin",
      actorId: adminSession.actorId,
      workspaceId: body.workspaceId,
      userId: null,
      resourceType: "invitation",
      resourceId: invitation.invitation.id,
      metadata: {
        email: body.email,
        role: body.role
      }
    });

    return reply.code(201).send(invitationCreateResponseSchema.parse(invitation));
  });

  app.post("/v1/auth/invitations/:id/accept", async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session) {
      return;
    }

    const body = invitationAcceptRequestSchema.parse(request.body);
    const invitation = await app.services.securityService.acceptInvitation({
      userId: session.user.id,
      userEmail: session.user.email,
      token: body.token
    });
    if (!invitation) {
      return reply.code(400).send({
        error: {
          code: "INVITATION_INVALID",
          message: "Invitation is invalid, expired, or does not match the current user"
        }
      });
    }

    await app.services.auditService.record({
      action: "auth.invitation.accept",
      actorType: "user",
      actorId: session.user.id,
      workspaceId: invitation.workspaceId,
      userId: session.user.id,
      resourceType: "invitation",
      resourceId: invitation.id,
      metadata: {
        email: invitation.email,
        role: invitation.role
      }
    });

    return invitationSchema.parse(invitation);
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const token = extractSessionToken(request);
    if (!token) {
      return reply.code(401).send({
        error: {
          code: "MISSING_SESSION",
          message: "Session token is required"
        }
      });
    }

    const session = await app.services.authService.getSession(token);
    await app.services.authService.logout(token);

    if (session) {
      await app.services.auditService.record({
        action: "auth.logout",
        actorType: "user",
        actorId: session.user.id,
        workspaceId: session.user.workspaces[0]?.id ?? null,
        userId: session.user.id,
        resourceType: "session",
        resourceId: null,
        metadata: {}
      });
    }

    clearSessionCookies(reply);
    return { ok: true };
  });

  app.post("/v1/auth/password/forgot", async (request, reply) => {
    const body = passwordResetForgotRequestSchema.parse(request.body);
    const result = await app.services.authService.requestPasswordReset({
      email: body.email,
      expiresInSec: 60 * 60
    });

    await app.services.auditService.record({
      action: "auth.password.forgot",
      actorType: "system",
      actorId: null,
      workspaceId: null,
      userId: null,
      resourceType: "password_reset",
      resourceId: null,
      metadata: {
        email: body.email,
        previewIssued: Boolean(result.resetToken)
      }
    });

    return passwordResetForgotResponseSchema.parse(
      app.config.NODE_ENV === "production"
        ? { ok: true }
        : {
            ok: true,
            ...(result.resetToken ? { resetToken: result.resetToken } : {}),
            ...(result.expiresAt ? { expiresAt: result.expiresAt } : {})
          }
    );
  });

  app.post("/v1/auth/password/reset", async (request, reply) => {
    const body = passwordResetRequestSchema.parse(request.body);
    const session = await app.services.authService.resetPassword({
      token: body.token,
      password: body.password
    });
    if (!session) {
      return reply.code(400).send({
        error: {
          code: "PASSWORD_RESET_INVALID",
          message: "Password reset token is invalid or expired"
        }
      });
    }

    await app.services.auditService.record({
      action: "auth.password.reset",
      actorType: "user",
      actorId: session.user.id,
      workspaceId: session.user.workspaces[0]?.id ?? null,
      userId: session.user.id,
      resourceType: "password_reset",
      resourceId: session.user.id,
      metadata: {}
    });

    setSessionCookies(reply, session);
    return authSessionResponseSchema.parse(session);
  });
};

export default authRoutes;
