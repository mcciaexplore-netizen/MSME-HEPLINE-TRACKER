"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    setBusy(false);
    if (res.ok) router.replace("/dashboard");
    else setError((await res.json()).error ?? "Sign in failed.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy font-heading text-lg font-bold text-white">M</span>
        <span className="leading-tight">
          <span className="block font-heading text-sm font-bold text-navy">MCCIA</span>
          <span className="block text-xs text-muted">MSME Helpline</span>
        </span>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <h1 className="text-xl font-bold text-navy">Admin sign in</h1>
        <label className="block">
          <span className="label">Username</span>
          <input suppressHydrationWarning className="input mt-1 w-full" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input suppressHydrationWarning type="password" className="input mt-1 w-full" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="text-sm font-semibold text-red-700" role="alert">{error}</p>}
        <button suppressHydrationWarning className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>    </main>
  );
}
