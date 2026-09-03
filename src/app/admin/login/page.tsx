"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { nestjsApi } from "@/lib/nestjs-api";

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const redirectTo = requestedRedirect?.startsWith("/admin") && !requestedRedirect.startsWith("//") ? requestedRedirect : "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await nestjsApi.auth.login(email, password);
      window.location.assign(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="adminLogin">
      <div className="adminLoginCard">
        <img src="/mehtaxd-ninja.jpg" alt="MehtaXD" />
        <div className="adminEyebrow">MEHTAXD ADMIN</div>
        <h1>Welcome back.</h1>
        <p>Sign in to manage your single-store catalog and customer orders.</p>
        <form onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
              placeholder="admin@mehtaxd.com"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </label>
          {error && <div className="adminNotice">{error}</div>}
          <button className="adminButton primary" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
