import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getDashboardSession } from "@/lib/auth";
import { fetchJson } from "@/lib/api";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const invitationToken = typeof params.invitationToken === "string" ? params.invitationToken : undefined;
  const resetToken = typeof params.resetToken === "string" ? params.resetToken : undefined;
  const session = await getDashboardSession();
  if (session) {
    if (invitationToken) {
      await fetchJson("/v1/auth/invitations/pending/accept", {
        method: "POST",
        headers: {
          "x-kori-session": session.sessionToken
        },
        body: JSON.stringify({
          token: invitationToken
        })
      }).catch(() => undefined);
    }
    redirect("/");
  }

  return (
    <main className="login-shell">
      <section className="panel login-card">
        <p className="eyebrow">Authentication</p>
        <h1>Admin sign-in</h1>
        <p className="lede">
          Sign in with a real API session cookie. The dashboard now resolves protected pages through the same session
          surface used by the Fastify control plane.
        </p>
        <LoginForm invitationToken={invitationToken} resetToken={resetToken} />
      </section>
    </main>
  );
}
