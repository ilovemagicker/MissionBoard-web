"use client";

import { useMemo, useState } from "react";
import { dateLocale } from "@/lib/format";
import { t } from "@/lib/i18n";
import {
  buildIcsCalendar,
  downloadBlob,
  downloadTextFile,
  filterShiftsForExport,
  memberDisplayName,
  monthFileStamp,
  renderMonthRosterPng,
} from "@/lib/schedule-export";
import type { Locale, ProfileRow, ShiftRow } from "@/lib/types";

type Member = { user_id: string; role: string; nickname: string | null };

const WEEKDAYS_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Scope = "mine" | "all" | "pick";

export function ScheduleExportPanel({
  locale,
  spaceName,
  currentUserId,
  members,
  profiles,
  shifts,
  cursorMonth,
  onClose,
}: {
  locale: Locale;
  spaceName: string;
  currentUserId: string;
  members: Member[];
  profiles: Record<string, ProfileRow>;
  shifts: ShiftRow[];
  cursorMonth: Date;
  onClose: () => void;
}) {
  const assignable = useMemo(
    () => members.filter((m) => m.role !== "viewer"),
    [members]
  );
  const [scope, setScope] = useState<Scope>("mine");
  const [picked, setPicked] = useState<string[]>([currentUserId]);
  const [busy, setBusy] = useState<"ics" | "png" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const monthLabel = useMemo(
    () =>
      cursorMonth.toLocaleDateString(dateLocale(locale), {
        year: "numeric",
        month: "long",
      }),
    [cursorMonth, locale]
  );

  const selectedUserIds = useMemo(() => {
    if (scope === "mine") return [currentUserId];
    if (scope === "all") return "all" as const;
    return picked.length > 0 ? picked : [currentUserId];
  }, [scope, currentUserId, picked]);

  const exportShifts = useMemo(
    () =>
      filterShiftsForExport(shifts, {
        cursorMonth,
        userIds: selectedUserIds,
      }),
    [shifts, cursorMonth, selectedUserIds]
  );

  const rowUserIds = useMemo(() => {
    if (scope === "mine") return [currentUserId];
    if (scope === "all") {
      return assignable.map((m) => m.user_id);
    }
    return picked.length > 0 ? picked : [currentUserId];
  }, [scope, currentUserId, assignable, picked]);

  const filterLabel = useMemo(() => {
    if (scope === "mine") return t(locale, "scheduleExportOnlyMine");
    if (scope === "all") return t(locale, "scheduleExportAllMembers");
    if (picked.length === 1) {
      return memberDisplayName(
        picked[0],
        members,
        profiles,
        t(locale, "scheduleMemberFallback")
      );
    }
    return t(locale, "scheduleExportPickedCount").replace(
      "{n}",
      String(picked.length)
    );
  }, [scope, locale, picked, members, profiles]);

  function togglePick(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onDownloadIcs() {
    setError(null);
    setOkMsg(null);
    if (exportShifts.length === 0) {
      setError(t(locale, "scheduleExportEmpty"));
      return;
    }
    setBusy("ics");
    try {
      const ics = buildIcsCalendar({
        shifts: exportShifts,
        members,
        profiles,
        spaceName: spaceName || t(locale, "appName"),
        memberFallback: t(locale, "scheduleMemberFallback"),
        eventPrefix: t(locale, "scheduleExportEventPrefix"),
      });
      const stamp = monthFileStamp(cursorMonth);
      downloadTextFile(
        `work-assistants-schedule-${stamp}.ics`,
        ics,
        "text/calendar;charset=utf-8"
      );
      setOkMsg(
        t(locale, "scheduleExportIcsDone").replace(
          "{n}",
          String(exportShifts.length)
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "error"));
    } finally {
      setBusy(null);
    }
  }

  async function onDownloadPng() {
    setError(null);
    setOkMsg(null);
    setBusy("png");
    try {
      const blob = await renderMonthRosterPng({
        cursorMonth,
        shifts: exportShifts,
        members,
        profiles,
        rowUserIds,
        labels: {
          title: `${spaceName || t(locale, "scheduleTitle")} · ${monthLabel}`,
          weekdays: locale === "en" ? WEEKDAYS_EN : WEEKDAYS_ZH,
          memberFallback: t(locale, "scheduleMemberFallback"),
          filterLabel,
          brand: t(locale, "appName"),
        },
      });
      const stamp = monthFileStamp(cursorMonth);
      downloadBlob(`work-assistants-roster-${stamp}.png`, blob);
      setOkMsg(t(locale, "scheduleExportPngDone"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "error"));
    } finally {
      setBusy(null);
    }
  }

  function onPrint() {
    setError(null);
    setOkMsg(null);
    setBusy("print");
    try {
      const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
      if (!win) {
        setError(t(locale, "scheduleExportPrintBlocked"));
        setBusy(null);
        return;
      }
      const rowsHtml = rowUserIds
        .map((uid) => {
          const name = memberDisplayName(
            uid,
            members,
            profiles,
            t(locale, "scheduleMemberFallback")
          );
          const items = exportShifts
            .filter((s) => s.user_id === uid)
            .map((s) => {
              const start = new Date(s.start_at);
              const end = new Date(s.end_at);
              const day = `${start.getMonth() + 1}/${start.getDate()}`;
              const hm = (x: Date) =>
                `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
              const title = (s.title ?? "").trim() || `${hm(start)}–${hm(end)}`;
              return `<li><strong>${day}</strong> ${title}</li>`;
            })
            .join("");
          return `<section><h3>${escapeHtml(name)}</h3><ul>${items || `<li>${escapeHtml(t(locale, "scheduleExportEmptyMember"))}</li>`}</ul></section>`;
        })
        .join("");

      win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(monthLabel)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:24px;max-width:800px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#64748b;font-size:12px;margin-bottom:20px}
  section{break-inside:avoid;margin-bottom:16px;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px}
  h3{margin:0 0 8px;font-size:14px} ul{margin:0;padding-left:18px;font-size:13px;line-height:1.5}
  @media print{body{padding:0}}
</style></head><body>
<h1>${escapeHtml(spaceName || t(locale, "scheduleTitle"))} · ${escapeHtml(monthLabel)}</h1>
<p class="sub">${escapeHtml(t(locale, "appName"))} · ${escapeHtml(filterLabel)} · ${exportShifts.length} ${escapeHtml(t(locale, "scheduleExportShiftsUnit"))}</p>
${rowsHtml}
<script>window.onload=function(){window.print();}</script>
</body></html>`);
      win.document.close();
      setOkMsg(t(locale, "scheduleExportPrintDone"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t(locale, "error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {t(locale, "scheduleExportTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {t(locale, "scheduleExportHint")}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-700">
              {monthLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            {t(locale, "cancel")}
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-700">
            {t(locale, "scheduleExportScope")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["mine", "scheduleExportOnlyMine"],
                ["all", "scheduleExportAllMembers"],
                ["pick", "scheduleExportPickMembers"],
              ] as const
            ).map(([id, key]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScope(id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                  scope === id
                    ? "bg-emerald-600 text-white ring-emerald-600"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {t(locale, key)}
              </button>
            ))}
          </div>
        </div>

        {scope === "pick" ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
            {assignable.map((m) => {
              const on = picked.includes(m.user_id);
              const label = memberDisplayName(
                m.user_id,
                members,
                profiles,
                t(locale, "scheduleMemberFallback")
              );
              return (
                <li key={m.user_id}>
                  <button
                    type="button"
                    onClick={() => togglePick(m.user_id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                      on
                        ? "bg-emerald-50 font-semibold text-emerald-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs">{on ? "✓" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {t(locale, "scheduleExportCount").replace(
            "{n}",
            String(exportShifts.length)
          )}
        </p>

        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {okMsg}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onDownloadIcs()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy === "ics"
              ? t(locale, "loading")
              : t(locale, "scheduleExportIcs")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onDownloadPng()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busy === "png"
              ? t(locale, "loading")
              : t(locale, "scheduleExportPng")}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={onPrint}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-3 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === "print"
              ? t(locale, "loading")
              : t(locale, "scheduleExportPrint")}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {t(locale, "scheduleExportNote015")}
        </p>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
