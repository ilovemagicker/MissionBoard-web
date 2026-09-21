"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { signOutAction } from "@/app/actions/auth";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setLoggedInEmail(data.user?.email ?? null);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!isSupabaseConfigured()) {
      setMessage("尚未設定 Supabase：請在 .env.local 填入 URL 與 anon key。");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.href = "/app/missions";
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: displayName || undefined,
              auth_provider: "email",
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          window.location.href = "/app/missions";
          return;
        }
        setMessage(
          "註冊成功。若需驗證信箱，請到信箱點確認連結；否則可直接登入。"
        );
        setMode("signin");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "登入失敗");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    setMessage(null);
    if (!isSupabaseConfigured()) {
      setMessage("尚未設定 Supabase：請在 .env.local 填入 URL 與 anon key。");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Google 登入失敗");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200/80">
        <Link href="/" className="text-sm font-medium text-blue-600">
          ← Mission Board
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          {mode === "signin" ? "使用 Email 登入" : "建立帳號"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          與 iOS App 同一個 Supabase 專案。
        </p>

        {loggedInEmail && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-700">已登入：{loggedInEmail}</span>
            <div className="flex gap-2">
              <Link
                href="/app/missions"
                className="font-semibold text-blue-600"
              >
                工作台
              </Link>
              <form action={signOutAction}>
                <button type="submit" className="font-semibold text-slate-600">
                  登出
                </button>
              </form>
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={onGoogleSignIn}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.8-4.1 2.8-7 0-.7-.1-1.3-.2-1.9H12z"
            />
            <path
              fill="#34A853"
              d="M6.6 14.3l-.8.6-2.7 2.1C4.8 19.7 8.1 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 .9-3.6.9-2.8 0-5.1-1.9-5.9-4.4z"
            />
            <path
              fill="#4A90E2"
              d="M3.1 7c-.6 1.2-1 2.5-1 4s.4 2.8 1 4l3.5-2.7c-.2-.6-.3-1.2-.3-1.3s.1-.7.3-1.3L3.1 7z"
            />
            <path
              fill="#FBBC05"
              d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2 8.1 2 4.8 4.3 3.1 7l3.5 2.7C7 7.8 9.2 5.9 12 5.9z"
            />
          </svg>
          使用 Google 登入
        </button>

        <div className="relative my-4 text-center text-xs font-medium text-slate-400">
          <span className="bg-white px-2 relative z-10">或</span>
          <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`h-10 rounded-lg text-sm font-semibold ${
              mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            登入
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`h-10 rounded-lg text-sm font-semibold ${
              mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            註冊
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <input
              className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
              placeholder="顯示名稱"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          <input
            className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500"
            type="password"
            required
            minLength={6}
            placeholder="密碼（至少 6 字）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "處理中…" : mode === "signin" ? "登入" : "建立帳號"}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
