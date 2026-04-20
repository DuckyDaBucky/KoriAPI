import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthSessionResponse } from "@kori/shared";
import { fetchJson } from "@/lib/api";

export const dashboardSessionCookie = "better-auth.session_token";
export const legacyDashboardSessionCookie = "kori_session";

async function getCookieStore() {
  return cookies();
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await getCookieStore();
  return (
    cookieStore.get(dashboardSessionCookie)?.value ??
    cookieStore.get(legacyDashboardSessionCookie)?.value ??
    null
  );
}

export async function getDashboardSession(): Promise<{
  session: AuthSessionResponse;
  sessionToken: string;
} | null> {
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return null;
  }

  try {
    const session = await fetchJson<AuthSessionResponse>("/v1/auth/session", {
      headers: {
        "x-kori-session": sessionToken
      }
    });
    return { session, sessionToken };
  } catch {
    return null;
  }
}

export async function requireDashboardSession(): Promise<{
  session: AuthSessionResponse;
  sessionToken: string;
}> {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login");
  }

  return session;
}
