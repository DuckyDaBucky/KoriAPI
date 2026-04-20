export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="panel login-card">
        <p className="eyebrow">Authentication</p>
        <h1>Admin sign-in</h1>
        <p className="lede">
          This route is reserved for the Better Auth migration. The current API session compatibility layer remains
          active while the dashboard moves onto server-side auth guards.
        </p>
        <form className="form-grid">
          <input type="email" placeholder="owner@example.com" />
          <input type="password" placeholder="Password" />
          <button className="button" type="button">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
