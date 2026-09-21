"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        window.location.href = "/dashboard";
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: displayName || undefined },
          },
        });
        if (error) throw error;
        setMessage("註冊成功。若需驗證信箱，請到信箱點確認連結；否則可直接登入。");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "登入失敗");
    } finally {
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

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
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
