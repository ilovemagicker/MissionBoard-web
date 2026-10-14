"use client";

import { FormEvent, useState, useTransition } from "react";
import { createMissionAction } from "@/app/actions/missions";
import { t } from "@/lib/i18n";
import type { Locale, ProfileRow } from "@/lib/types";

export function CreateMissionForm({
  locale,
  spaceId,
  members,
  profiles,
}: {
  locale: Locale;
  spaceId: string;
  members: { user_id: string; role: string }[];
  profiles: Record<string, ProfileRow>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("space_id", spaceId);
    setError(null);
    startTransition(async () => {
      const res = await createMissionAction(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200/80"
    >
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">{t(locale, "title")}</span>
        <input
          name="title"
          required
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          {t(locale, "description")}
        </span>
        <textarea
          name="description"
          rows={4}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "startDate")}
          </span>
          <input
            type="date"
            name="start_date"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "dueDate")}
          </span>
          <input
            type="date"
            name="due_date"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "priority")}
          </span>
          <select
            name="priority"
            defaultValue="medium"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="high">{t(locale, "priorityHigh")}</option>
            <option value="medium">{t(locale, "priorityMedium")}</option>
            <option value="low">{t(locale, "priorityLow")}</option>
            <option value="none">{t(locale, "priorityNone")}</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            {t(locale, "decisionMaker")}
          </span>
          <select
            name="decision_maker_id"
            defaultValue=""
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="">{t(locale, "decisionMakerNone")}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {profiles[m.user_id]?.display_name || m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-slate-400">{t(locale, "decisionMakerHint")}</p>
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {pending ? t(locale, "loading") : t(locale, "create")}
      </button>
    </form>
  );
}
