"use client";

import { useActionState } from "react";
import { loginDashboard } from "@/lib/auth-actions";

const initialState = {} as { error?: string };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginDashboard, initialState);

  return (
    <form className="form-grid" action={formAction}>
      <input name="email" type="email" placeholder="owner@example.com" required />
      <input name="password" type="password" placeholder="Password" required />
      {state?.error ? <p className="error-text">{state.error}</p> : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Continue"}
      </button>
    </form>
  );
}
