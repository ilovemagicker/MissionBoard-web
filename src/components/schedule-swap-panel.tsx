"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptShiftSwapAction,
  cancelShiftSwapAction,
  declineShiftSwapAction,
  requestShiftCoverAction,
  requestShiftSwapAction,
  setShiftSwapApprovalModeAction,
} from "@/app/actions/shift-swaps";
import { dateLocale, t } from "@/lib/i18n";
import type {
  Locale,
  ProfileRow,
  ShiftRow,
  ShiftSwapApprovalMode,
  ShiftSwapRequestRow,
} from "@/lib/types";

type Member = { user_id: string; role: string; nickname: string | null };

function memberLabel(
  userId: string,
  members: Member[],
  profiles: Record<string, ProfileRow>,
  fallback: string
) {
  const m = members.find((x) => x.user_id === userId);
  if (m?.nickname?.trim()) return m.nickname.trim();
  const p = profiles[userId];
  if (p?.display_name?.trim()) return p.display_name.trim();
  return fallback;
}

function isAdminLike(members: Member[], userId: string) {
  const role = members.find((m) => m.user_id === userId)?.role;
  return role === "owner" || role === "admin";
}

function isEditor(members: Member[], userId: string) {
  const role = members.find((m) => m.user_id === userId)?.role;
  return role === "owner" || role === "admin" || role === "member";
}

function formatShiftSummary(shift: ShiftRow, locale: Locale) {
  const start = new Date(shift.start_at);
  const end = new Date(shift.end_at);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const loc = dateLocale(locale);
  const range = `${start.toLocaleString(loc, opts)} – ${end.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}`;
  return shift.title ? `${range} · ${shift.title}` : range;
}

function usesConsent(
  req: ShiftSwapRequestRow,
  mode: ShiftSwapApprovalMode,
  hasConsentColumn: boolean
) {
  return mode === "admin_required" && hasConsentColumn;
}

function isConsentStep(
  req: ShiftSwapRequestRow,
  mode: ShiftSwapApprovalMode,
  currentUserId: string,
  members: Member[],
  hasConsentColumn: boolean
) {
  if (!usesConsent(req, mode, hasConsentColumn)) return false;
  if (req.status !== "pending") return false;
  if (req.target_accepted_at) return false;
  return (
    req.target_user_id === currentUserId &&
    !isAdminLike(members, currentUserId)
  );
}

function canAccept(
  req: ShiftSwapRequestRow,
  mode: ShiftSwapApprovalMode,
  currentUserId: string,
  members: Member[],
  hasConsentColumn: boolean
) {
  if (req.status !== "pending") return false;
  const admin = isAdminLike(members, currentUserId);
  const target = req.target_user_id === currentUserId;
  if (!admin && !target) return false;

  if (mode === "peer_accept") return true;

  // admin_required
  if (hasConsentColumn) {
    if (target && !admin) return true; // consent step
    if (admin) {
      // admin can finalize if target agreed, or if admin is the target
      return Boolean(req.target_accepted_at) || target;
    }
    return false;
  }
  // legacy: only admin
  return admin;
}

function canDecline(
  req: ShiftSwapRequestRow,
  currentUserId: string,
  members: Member[]
) {
  if (req.status !== "pending") return false;
  return (
    req.target_user_id === currentUserId ||
    isAdminLike(members, currentUserId)
  );
}

export function ScheduleSwapInbox({
  locale,
  spaceId,
  currentUserId,
  members,
  profiles,
  shifts,
  swapRequests,
  approvalMode,
  open,
  onClose,
}: {
  locale: Locale;
  spaceId: string;
  currentUserId: string;
  members: Member[];
  profiles: Record<string, ProfileRow>;
  shifts: ShiftRow[];
  swapRequests: ShiftSwapRequestRow[];
  approvalMode: ShiftSwapApprovalMode;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mode, setMode] = useState(approvalMode);

  const hasConsentColumn = useMemo(
    () =>
      swapRequests.some(
        (r) => r.target_accepted_at !== undefined && r.target_accepted_at !== null
      ) ||
      swapRequests.every((r) => "target_accepted_at" in r) ||
      true,
    [swapRequests]
  );

  const needsMe = useMemo(() => {
    return swapRequests.filter((r) => {
      if (r.status !== "pending") return false;
      return (
        canAccept(r, mode, currentUserId, members, hasConsentColumn) ||
        (canDecline(r, currentUserId, members) &&
          r.requester_id !== currentUserId)
      );
    });
  }, [swapRequests, mode, currentUserId, members, hasConsentColumn]);

  const otherPending = useMemo(() => {
    const ids = new Set(needsMe.map((r) => r.id));
    return swapRequests.filter((r) => r.status === "pending" && !ids.has(r.id));
  }, [swapRequests, needsMe]);

  const resolved = useMemo(
    () =>
      swapRequests
        .filter((r) => r.status !== "pending")
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 30),
    [swapRequests]
  );

  if (!open) return null;

  const admin = isAdminLike(members, currentUserId);

  function shiftById(id: string | null | undefined) {
    if (!id) return undefined;
    return shifts.find((s) => s.id === id);
  }

  function statusLabel(req: ShiftSwapRequestRow) {
    if (req.status === "pending") {
      if (req.target_accepted_at) return t(locale, "scheduleSwapStatusAgreed");
      return t(locale, "scheduleSwapStatusPending");
    }
    if (req.status === "accepted") return t(locale, "scheduleSwapStatusAccepted");
    if (req.status === "declined") return t(locale, "scheduleSwapStatusDeclined");
    return t(locale, "scheduleSwapStatusCancelled");
  }

  function acceptTitle(req: ShiftSwapRequestRow) {
    if (isConsentStep(req, mode, currentUserId, members, hasConsentColumn)) {
      return t(locale, "scheduleSwapAgree");
    }
    return mode === "admin_required"
      ? t(locale, "scheduleSwapApprove")
      : t(locale, "scheduleSwapAccept");
  }

  function waitingLine(req: ShiftSwapRequestRow): string | null {
    if (req.status !== "pending") return null;
    if (mode === "peer_accept") {
      return req.target_user_id === currentUserId
        ? null
        : t(locale, "scheduleSwapWaitingTarget").replace(
            "{name}",
            memberLabel(
              req.target_user_id,
              members,
              profiles,
              t(locale, "scheduleMemberFallback")
            )
          );
    }
    if (usesConsent(req, mode, hasConsentColumn)) {
      if (!req.target_accepted_at) {
        return req.target_user_id === currentUserId
          ? null
          : t(locale, "scheduleSwapWaitingTarget").replace(
              "{name}",
              memberLabel(
                req.target_user_id,
                members,
                profiles,
                t(locale, "scheduleMemberFallback")
              )
            );
      }
      return canAccept(req, mode, currentUserId, members, hasConsentColumn)
        ? t(locale, "scheduleSwapTargetAgreed")
        : t(locale, "scheduleSwapWaitingAdmin");
    }
    return canAccept(req, mode, currentUserId, members, hasConsentColumn)
      ? null
      : t(locale, "scheduleSwapWaitingAdmin");
  }

  function run(
    req: ShiftSwapRequestRow,
    action: "accept" | "decline" | "cancel"
  ) {
    setBusyId(req.id);
    startTransition(async () => {
      setError(null);
      const result =
        action === "accept"
          ? await acceptShiftSwapAction(req.id)
          : action === "decline"
            ? await declineShiftSwapAction(req.id)
            : await cancelShiftSwapAction(req.id);
      setBusyId(null);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function changeMode(next: ShiftSwapApprovalMode) {
    setMode(next);
    startTransition(async () => {
      setError(null);
      const result = await setShiftSwapApprovalModeAction({
        spaceId,
        mode: next,
      });
      if (result && "error" in result && result.error) {
        setError(result.error);
        setMode(approvalMode);
        return;
      }
      router.refresh();
    });
  }

  function renderRow(req: ShiftSwapRequestRow) {
    const shift = shiftById(req.shift_id);
    const counter = shiftById(req.counter_shift_id);
    const waiting = waitingLine(req);
    const accept = canAccept(req, mode, currentUserId, members, hasConsentColumn);
    const decline = canDecline(req, currentUserId, members);
    const mine = req.requester_id === currentUserId;
    const busy = busyId === req.id || pending;

    return (
      <li
        key={req.id}
        className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">
            {req.kind === "cover"
              ? t(locale, "scheduleSwapKindCover")
              : t(locale, "scheduleSwapKindSwap")}
          </p>
          <span
            className={`text-xs font-semibold ${
              req.status === "pending"
                ? "text-orange-600"
                : req.status === "accepted"
                  ? "text-green-700"
                  : "text-slate-500"
            }`}
          >
            {statusLabel(req)}
          </span>
        </div>
        {shift ? (
          <p className="mt-1 text-xs text-slate-600">
            {formatShiftSummary(shift, locale)}
          </p>
        ) : null}
        {counter ? (
          <p className="text-xs text-slate-600">
            ⇄ {formatShiftSummary(counter, locale)}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          {t(locale, "scheduleSwapParties")
            .replace(
              "{requester}",
              memberLabel(
                req.requester_id,
                members,
                profiles,
                t(locale, "scheduleMemberFallback")
              )
            )
            .replace(
              "{target}",
              memberLabel(
                req.target_user_id,
                members,
                profiles,
                t(locale, "scheduleMemberFallback")
              )
            )}
        </p>
        {req.note ? (
          <p className="mt-1 text-xs text-slate-400">{req.note}</p>
        ) : null}
        {waiting ? (
          <p className="mt-1 text-xs font-medium text-orange-600">{waiting}</p>
        ) : null}
        {req.status === "pending" ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {accept ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(req, "accept")}
                className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
              >
                {acceptTitle(req)}
              </button>
            ) : null}
            {decline && !mine ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(req, "decline")}
                className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-red-600 ring-1 ring-red-200 disabled:opacity-60"
              >
                {t(locale, "scheduleSwapDecline")}
              </button>
            ) : null}
            {mine ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(req, "cancel")}
                className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
              >
                {t(locale, "scheduleSwapCancel")}
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  const modeHint =
    mode === "peer_accept"
      ? t(locale, "scheduleSwapHintPeerAccept")
      : hasConsentColumn
        ? t(locale, "scheduleSwapHintAdminConsent")
        : t(locale, "scheduleSwapHintAdminRequired");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900">
            {t(locale, "scheduleSwapTitle")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            {t(locale, "close")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-slate-500">{modeHint}</p>

          {admin ? (
            <label className="block text-xs font-semibold text-slate-500">
              {t(locale, "scheduleSwapApprovalMode")}
              <select
                value={mode}
                disabled={pending}
                onChange={(e) =>
                  changeMode(e.target.value as ShiftSwapApprovalMode)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800"
              >
                <option value="admin_required">
                  {t(locale, "scheduleSwapApprovalModeAdmin")}
                </option>
                <option value="peer_accept">
                  {t(locale, "scheduleSwapApprovalModePeer")}
                </option>
              </select>
              <span className="mt-1 block font-normal text-slate-400">
                {mode === "peer_accept"
                  ? t(locale, "scheduleSwapApprovalModeHintPeer")
                  : t(locale, "scheduleSwapApprovalModeHintAdmin")}
              </span>
            </label>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {needsMe.length === 0 &&
          otherPending.length === 0 &&
          resolved.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              {t(locale, "scheduleSwapEmpty")}
            </p>
          ) : null}

          {needsMe.length > 0 ? (
            <section>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                {t(locale, "scheduleSwapNeedsMeSection")}
              </h4>
              <ul className="space-y-2">{needsMe.map(renderRow)}</ul>
            </section>
          ) : null}

          {otherPending.length > 0 ? (
            <section>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                {t(locale, "scheduleSwapPendingSection")}
              </h4>
              <ul className="space-y-2">{otherPending.map(renderRow)}</ul>
            </section>
          ) : null}

          {resolved.length > 0 ? (
            <section>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                {t(locale, "scheduleSwapResolvedSection")}
              </h4>
              <ul className="space-y-2">{resolved.map(renderRow)}</ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ScheduleSwapRequestSheet({
  locale,
  currentUserId,
  members,
  profiles,
  shifts,
  swapRequests,
  shift,
  approvalMode,
  open,
  onClose,
}: {
  locale: Locale;
  currentUserId: string;
  members: Member[];
  profiles: Record<string, ProfileRow>;
  shifts: ShiftRow[];
  swapRequests: ShiftSwapRequestRow[];
  shift: ShiftRow | null;
  approvalMode: ShiftSwapApprovalMode;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"cover" | "swap">("cover");
  const [targetUserId, setTargetUserId] = useState("");
  const [counterShiftId, setCounterShiftId] = useState("");
  const [note, setNote] = useState("");

  const isOwner = shift?.user_id === currentUserId;

  const memberChoices = useMemo(() => {
    if (!shift) return [];
    return members
      .filter(
        (m) =>
          m.user_id !== currentUserId &&
          isEditor(members, m.user_id)
      )
      .map((m) => ({
        id: m.user_id,
        name: memberLabel(
          m.user_id,
          members,
          profiles,
          t(locale, "scheduleMemberFallback")
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, profiles, currentUserId, shift, locale]);

  const pendingShiftIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of swapRequests) {
      if (r.status !== "pending") continue;
      set.add(r.shift_id);
      if (r.counter_shift_id) set.add(r.counter_shift_id);
    }
    return set;
  }, [swapRequests]);

  const counterChoices = useMemo(() => {
    if (!shift || !targetUserId) return [];
    const now = Date.now();
    return shifts
      .filter(
        (s) =>
          s.space_id === shift.space_id &&
          s.user_id === targetUserId &&
          s.status === "scheduled" &&
          s.id !== shift.id &&
          new Date(s.end_at).getTime() > now &&
          !pendingShiftIds.has(s.id)
      )
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
  }, [shifts, shift, targetUserId, pendingShiftIds]);

  if (!open || !shift) return null;

  const flowHint =
    approvalMode === "peer_accept"
      ? t(locale, "scheduleSwapFlowPeer")
      : t(locale, "scheduleSwapFlowConsent");

  function submit() {
    if (!shift) return;
    startTransition(async () => {
      setError(null);
      let result;
      if (isOwner) {
        if (!targetUserId) {
          setError(t(locale, "scheduleSwapPickMember"));
          return;
        }
        if (kind === "cover") {
          result = await requestShiftCoverAction({
            shiftId: shift.id,
            targetUserId,
            note,
          });
        } else {
          if (!counterShiftId) {
            setError(t(locale, "scheduleSwapPickShift"));
            return;
          }
          result = await requestShiftSwapAction({
            shiftId: shift.id,
            counterShiftId,
            note,
          });
        }
      } else {
        result = await requestShiftCoverAction({
          shiftId: shift.id,
          targetUserId: shift.user_id,
          note,
        });
      }
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setNote("");
      setTargetUserId("");
      setCounterShiftId("");
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">
          {t(locale, "scheduleSwapRequestTitle")}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {t(locale, "scheduleSwapRequestHint")}
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-800">
          {formatShiftSummary(shift, locale)}
        </p>

        <div className="mt-4 space-y-3">
          {isOwner ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setKind("cover");
                  setCounterShiftId("");
                }}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                  kind === "cover"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {t(locale, "scheduleSwapKindCover")}
              </button>
              <button
                type="button"
                onClick={() => setKind("swap")}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                  kind === "swap"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {t(locale, "scheduleSwapKindSwap")}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {t(locale, "scheduleSwapOfferCoverHint")}
            </p>
          )}

          {isOwner ? (
            <label className="block text-xs font-semibold text-slate-500">
              {t(locale, "scheduleSwapTarget")}
              <select
                value={targetUserId}
                onChange={(e) => {
                  setTargetUserId(e.target.value);
                  setCounterShiftId("");
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">{t(locale, "scheduleSwapPickMember")}</option>
                {memberChoices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-slate-700">
              {memberLabel(
                shift.user_id,
                members,
                profiles,
                t(locale, "scheduleMemberFallback")
              )}
            </p>
          )}

          {isOwner && kind === "swap" ? (
            <label className="block text-xs font-semibold text-slate-500">
              {t(locale, "scheduleSwapCounterShift")}
              {!targetUserId ? (
                <p className="mt-1 text-sm font-normal text-slate-400">
                  {t(locale, "scheduleSwapPickMemberFirst")}
                </p>
              ) : counterChoices.length === 0 ? (
                <p className="mt-1 text-sm font-normal text-slate-400">
                  {t(locale, "scheduleSwapNoCounterShifts")}
                </p>
              ) : (
                <select
                  value={counterShiftId}
                  onChange={(e) => setCounterShiftId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">{t(locale, "scheduleSwapPickShift")}</option>
                  {counterChoices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatShiftSummary(s, locale)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : null}

          <label className="block text-xs font-semibold text-slate-500">
            {t(locale, "scheduleSwapNote")}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(locale, "scheduleSwapNotePlaceholder")}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <p className="text-xs text-slate-400">{flowHint}</p>

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            {t(locale, "cancel")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {t(locale, "scheduleSwapSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
