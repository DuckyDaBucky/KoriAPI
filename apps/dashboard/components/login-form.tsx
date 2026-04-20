"use client";

import { useActionState } from "react";
import { completePasswordReset, loginDashboard } from "@/lib/auth-actions";

const initialState = {} as { error?: string };

export function LoginForm({
  invitationToken,
  resetToken
}: {
  invitationToken?: string | undefined;
  resetToken?: string | undefined;
}) {
  const [state, formAction, pending] = useActionState(loginDashboard, initialState);
  const [resetState, resetAction, resetPending] = useActionState(completePasswordReset, initialState);

  return (
    <div className="grid">
      <form className="form-grid" action={formAction}>
        {invitationToken ? <input type="hidden" name="invitationToken" value={invitationToken} /> : null}
        <input name="email" type="email" placeholder="owner@example.com" required />
        <input name="password" type="password" placeholder="Password" required />
        {state?.error ? <p className="error-text">{state.error}</p> : null}
        <button className="button" type="submit" disabled={pending}>
          {pending ? "Signing in..." : invitationToken ? "Sign in and accept invitation" : "Continue"}
        </button>
      </form>

      {resetToken ? (
        <form className="form-grid" action={resetAction}>
          <input type="hidden" name="token" value={resetToken} />
          <input name="password" type="password" placeholder="New password" required />
          {resetState?.error ? <p className="error-text">{resetState.error}</p> : null}
          <button className="button secondary" type="submit" disabled={resetPending}>
            {resetPending ? "Resetting..." : "Complete password reset"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
