"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createMcpTokenAction,
  revokeMcpTokenAction,
  type McpTokenListItem,
} from "@/app/actions/mcp-tokens";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function McpTokensPanel({
  locale,
  tokens: initial,
}: {
  locale: Locale;
  tokens: McpTokenListItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [tokens, setTokens] = useState(initial);
  const [name, setName] = useState("Cursor");
  const [write, setWrite] = useState(false);
  const [expiresDays, setExpiresDays] = useState<string>("90");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const active = useMemo(
    () => tokens.filter((t) => !t.revoked_at),
    [tokens]
  );
  const revoked = useMemo(
    () => tokens.filter((t) => t.revoked_at),
    [tokens]
  );

  function onCreate() {
    setError(null);
    setFreshToken(null);
    setCopied(false);
    const days = expiresDays.trim() === "" ? null : Number(expiresDays);
    startTransition(async () => {
      const res = await createMcpTokenAction({
        name,
        scopes: write ? ["read", "write_missions"] : ["read"],
        expiresInDays: days && Number.isFinite(days) ? days : null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.token && res.id) {
        setFreshToken(res.token);
        setTokens((prev) => [
          {
            id: res.id!,
            name: name.trim() || "MCP",
            scopes: write ? ["read", "write_missions"] : ["read"],
            expires_at:
              days && days > 0
                ? new Date(Date.now() + days * 86400_000).toISOString()
                : null,
            revoked_at: null,
            last_used_at: null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    });
  }

  function onRevoke(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await revokeMcpTokenAction(id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setTokens((prev) =>
        prev.map((row) =>
          row.id === id
            ? { ...row, revoked_at: new Date().toISOString() }
            : row
        )
      );
    });
  }

  async function copyToken() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section id="mcp" className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500">
        {t(locale, "mcpSection")}
      </h2>
      <p className="mt-1 text-[11px] text-slate-400">{t(locale, "mcpIntro")}</p>

      <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            {t(locale, "mcpTokenName")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            {t(locale, "mcpExpiresDays")}
            <input
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              disabled={pending}
              placeholder="90"
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={write}
            onChange={(e) => setWrite(e.target.checked)}
            disabled={pending}
          />
          {t(locale, "mcpScopeWrite")}
        </label>
        <button
          type="button"
          onClick={onCreate}
          disabled={pending}
          className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {t(locale, "mcpCreateToken")}
        </button>
      </div>

      {freshToken ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">
            {t(locale, "mcpTokenOnce")}
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white px-2 py-2 text-xs text-slate-800">
            {freshToken}
          </code>
          <button
            type="button"
            onClick={copyToken}
            className="mt-2 h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900"
          >
            {copied ? t(locale, "mcpCopied") : t(locale, "mcpCopy")}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t(locale, "mcpActiveTokens")}
        </h3>
        {active.length === 0 ? (
          <p className="text-sm text-slate-500">{t(locale, "mcpNoTokens")}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {active.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{row.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {row.scopes.join(", ")}
                    {row.expires_at
                      ? ` · exp ${new Date(row.expires_at).toLocaleDateString()}`
                      : ""}
                    {row.last_used_at
                      ? ` · used ${new Date(row.last_used_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRevoke(row.id)}
                  className="h-8 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  {t(locale, "mcpRevoke")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {revoked.length > 0 ? (
        <p className="mt-3 text-[11px] text-slate-400">
          {t(locale, "mcpRevokedCount").replace(
            "{n}",
            String(revoked.length)
          )}
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        <p className="font-semibold text-slate-600">{t(locale, "mcpCursorTitle")}</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-2 text-[10px] text-slate-700">{`{
  "mcpServers": {
    "work-assistants": {
      "url": "https://app.onyxlab.dev/api/mcp",
      "headers": {
        "Authorization": "Bearer wa_mcp_…"
      }
    }
  }
}`}</pre>
      </div>
    </section>
  );
}
