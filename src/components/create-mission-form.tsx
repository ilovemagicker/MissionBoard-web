"use client";

import { FormEvent, useState, useTransition } from "react";
import { createMissionAction } from "@/app/actions/missions";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function CreateMissionForm({
  locale,
  spaceId,
}: {
  locale: Locale;
  spaceId: string;
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
