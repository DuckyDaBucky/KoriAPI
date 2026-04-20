import type { Route } from "next";
import Link from "next/link";
import type { AuthSessionResponse } from "@kori/shared";
import { logoutDashboard } from "@/lib/auth-actions";

type DashboardShellProps = {
  title: string;
  description: string;
  session: AuthSessionResponse;
  children: React.ReactNode;
};

const navItems = [
  { href: "/" as Route, label: "Overview" },
  { href: "/devices" as Route, label: "Devices" },
  { href: "/telemetry" as Route, label: "Telemetry" },
  { href: "/operations" as Route, label: "Operations" },
  { href: "/jobs" as Route, label: "Jobs" },
  { href: "/integrations" as Route, label: "Integrations" },
  { href: "/contracts" as Route, label: "Contracts" }
];

export function DashboardShell({ title, description, session, children }: DashboardShellProps) {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="eyebrow">KoriAPI</p>
          <h2>Control Plane</h2>
          <p className="lede">Authenticated operator surface for devices, auth, telemetry, quotas, contracts, and jobs.</p>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <section className="panel session-card">
          <p className="eyebrow">Session</p>
          <strong>{session.user.name ?? session.user.email}</strong>
          <p className="meta">{session.user.roles.join(", ")}</p>
          <p className="meta">Expires {new Date(session.expiresAt).toLocaleString()}</p>
          <form action={logoutDashboard}>
            <button className="button secondary" type="submit">
              Logout
            </button>
          </form>
        </section>
      </aside>
      <section className="content">
        <section className="panel page-header">
          <p className="eyebrow">Staging Admin</p>
          <h1>{title}</h1>
          <p className="lede">{description}</p>
        </section>
        {children}
      </section>
    </main>
  );
}
