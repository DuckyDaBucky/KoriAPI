"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthSessionResponse } from "@kori/shared";
import { fetchJson } from "@/lib/api";
import {
  dashboardSessionCookie,
  getSessionToken,
  legacyDashboardSessionCookie
} from "@/lib/auth";

export async function loginDashboard(
  _previousState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string } | undefined> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      error: "Email and password are required."
    };
  }

  try {
    const session = await fetchJson<AuthSessionResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password
      })
    });
    const cookieStore = await cookies();
    const expires = new Date(session.expiresAt);
    for (const cookieName of [dashboardSessionCookie, legacyDashboardSessionCookie]) {
      cookieStore.set(cookieName, session.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires
      });
    }
  } catch {
    return {
      error: "Invalid login."
    };
  }

  redirect("/");
}

export async function logoutDashboard(): Promise<void> {
  const sessionToken = await getSessionToken();
  if (sessionToken) {
    try {
      await fetchJson("/v1/auth/logout", {
        method: "POST",
        headers: {
          "x-kori-session": sessionToken
        }
      });
    } catch {
      // Ignore logout propagation failures and clear the dashboard cookies regardless.
    }
  }

  const cookieStore = await cookies();
  for (const cookieName of [dashboardSessionCookie, legacyDashboardSessionCookie]) {
    cookieStore.set(cookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0)
    });
  }

  redirect("/login");
}
