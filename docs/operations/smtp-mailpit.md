# SMTP / Mailpit

Use this runbook to validate self-hosted invitation and password-reset delivery.

## Required env

1. Set `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM`.
2. Leave `SMTP_USER` and `SMTP_PASS` empty for a local Mailpit instance unless auth is enabled.
3. Keep `NODE_ENV=development` for local preview-token responses.

## Local Mailpit defaults

1. SMTP endpoint: `localhost:1025`
2. Web UI: `http://localhost:8025`

## Validation

1. Trigger `POST /v1/auth/password/forgot` for a known account.
2. Confirm the reset email appears in Mailpit.
3. Open the reset link and complete the password reset flow.
4. Trigger `POST /v1/auth/invitations` from an admin session.
5. Confirm the invitation email appears in Mailpit and the link contains the invitation token.

## Failure handling

1. If no mail is delivered, verify `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM`.
2. Check API logs for `integration=smtp`.
3. In development or test, use the preview token response as a fallback while SMTP is being repaired.
