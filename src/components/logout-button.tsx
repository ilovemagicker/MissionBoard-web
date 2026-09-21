"use client";

import { signOutAction } from "@/app/actions/auth";

export function LogoutButton({ label }: { label: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {label}
      </button>
    </form>
  );
}
