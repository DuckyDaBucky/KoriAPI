import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getDashboardSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getDashboardSession();
  if (session) {
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
        <LoginForm />
      </section>
    </main>
  );
}
