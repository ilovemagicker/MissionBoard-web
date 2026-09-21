"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptJoinRequestAction,
  archiveSpaceAction,
  createSpaceAction,
  declineJoinRequestAction,
  deleteSpaceAction,
  joinByInviteAction,
  transferSpaceOwnershipAction,
  unarchiveSpaceAction,
} from "@/app/actions/spaces";
import { useEntitlements } from "@/components/entitlements-provider";
import { LimitWallModal } from "@/components/monetization/limit-wall-modal";
import {
  precheckAcceptMember,
  precheckCreateSpace,
  type LimitKind,
} from "@/lib/entitlements";
import { roleLabel, t } from "@/lib/i18n";
import type { JoinRequestRow, Locale, ProfileRow, SpaceWithRole } from "@/lib/types";

export function SpacesClient({
  locale,
  spaces,
  membersBySpace,
  profiles,
  pendingRequests,
}: {
  locale: Locale;
  spaces: SpaceWithRole[];
  membersBySpace: Record<
    string,
    { user_id: string; role: string; nickname: string | null }[]
  >;
  profiles: Record<string, ProfileRow>;
  pendingRequests: (JoinRequestRow & { space_name?: string })[];
}) {
  const router = useRouter();
  const { entitlements, ready } = useEntitlements();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [transferFor, setTransferFor] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [wallKind, setWallKind] = useState<LimitKind | null>(null);
  const [wallOpen, setWallOpen] = useState(false);

  function openWall(kind: LimitKind) {
    setWallKind(kind);
    setWallOpen(true);
  }

  function run(fn: () => Promise<{ error?: string; ok?: boolean; invite_code?: string; spaceName?: string }>) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        if (res.invite_code) setInfo(`${t(locale, "inviteCode")}: ${res.invite_code}`);
        if (res.spaceName) setInfo(`OK: ${res.spaceName}`);
        router.refresh();
      }
    });
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    // Soft wall: only count non-archived spaces (same as "my spaces" list for create).
    const activeCount = spaces.filter((s) => !s.archived_at).length;
    if (ready) {
      const check = precheckCreateSpace(entitlements, activeCount);
      if (check.status === "blocked") {
        openWall(check.kind);
        return;
      }
      if (check.status === "unavailable") {
        setError(t(locale, "monQuotaUnavailableMessage"));
        return;
      }
    }
    const fd = new FormData();
    fd.set("name", name);
    run(async () => {
      const res = await createSpaceAction(fd);
      if (!res.error) setName("");
      return res;
    });
  }

  function onJoin(e: FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("invite_code", invite);
    run(async () => {
      const res = await joinByInviteAction(fd);
      if (!res.error) setInvite("");
      return res;
    });
  }

  function onAcceptRequest(request: JoinRequestRow & { space_name?: string }) {
    const members = membersBySpace[request.space_id] ?? [];
    const space = spaces.find((s) => s.id === request.space_id);
    const viewerIsOwner = space?.role === "owner";
    if (ready) {
      const check = precheckAcceptMember(
        entitlements,
        members.length,
        !!viewerIsOwner
      );
      if (check.status === "blocked") {
        openWall(check.kind);
        return;
      }
      if (check.status === "unavailable") {
        setError(t(locale, "monQuotaUnavailableMessage"));
        return;
      }
    }
    run(() => acceptJoinRequestAction(request.id));
  }

  function onTransfer(spaceId: string) {
    if (!transferTarget) return;
    if (!window.confirm(t(locale, "transferOwnershipConfirm"))) return;
    run(async () => {
      const res = await transferSpaceOwnershipAction(spaceId, transferTarget);
      if (!res.error) {
        setTransferFor(null);
        setTransferTarget("");
        setInfo(t(locale, "transferOwnershipSuccess"));
      }
      return res;
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {info && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {info}
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <form
          onSubmit={onCreate}
          className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80"
        >
          <h2 className="text-sm font-semibold text-slate-500">
            {t(locale, "createSpace")}
          </h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t(locale, "title")}
            className="mt-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-3 h-10 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white"
          >
            {t(locale, "create")}
          </button>
        </form>

        <form
          onSubmit={onJoin}
          className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80"
        >
          <h2 className="text-sm font-semibold text-slate-500">
            {t(locale, "joinSpace")}
          </h2>
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            required
            placeholder={t(locale, "inviteCode")}
            className="mt-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm uppercase"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
          >
            {t(locale, "submitJoin")}
          </button>
        </form>
      </section>

      {pendingRequests.length > 0 && (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">
            {t(locale, "pendingRequests")}
          </h2>
          <ul className="space-y-2">
            {pendingRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-semibold">
                    {profiles[r.requester_id]?.display_name || r.requester_id.slice(0, 8)}
                  </span>
                  <span className="text-slate-500">
                    {" "}
                    → {r.space_name || r.space_id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onAcceptRequest(r)}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                  >
                    {t(locale, "accept")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => declineJoinRequestAction(r.id))}
                    className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {t(locale, "decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        {spaces.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/80">
            {t(locale, "noSpaces")}
          </p>
        ) : (
          spaces.map((s) => {
            const archived = !!s.archived_at;
            const isOwner = s.role === "owner";
            const otherMembers = (membersBySpace[s.id] ?? []).filter(
              (m) => m.role !== "owner"
            );
            const showTransfer = transferFor === s.id;
            return (
              <div
                key={s.id}
                className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {s.name}
                      {archived && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          {t(locale, "archived")}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {roleLabel(locale, s.role)} · {t(locale, "inviteCode")}:{" "}
                      <code className="rounded bg-slate-100 px-1">{s.invite_code}</code>
                    </p>
                  </div>
                  {isOwner && (
                    <div className="flex flex-wrap gap-2">
                      {otherMembers.length > 0 && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setTransferFor(showTransfer ? null : s.id);
                            setTransferTarget("");
                            setError(null);
                          }}
                          className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"
                        >
                          {t(locale, "transferOwnership")}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !archived &&
                            !window.confirm(t(locale, "archiveSpaceConfirm"))
                          ) {
                            return;
                          }
                          run(() =>
                            archived
                              ? unarchiveSpaceAction(s.id)
                              : archiveSpaceAction(s.id)
                          );
                        }}
                        className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                      >
                        {archived
                          ? t(locale, "unarchiveSpace")
                          : t(locale, "archiveSpace")}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(t(locale, "deleteSpaceConfirm"))) return;
                          run(() => deleteSpaceAction(s.id));
                        }}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                      >
                        {t(locale, "deleteSpace")}
                      </button>
                    </div>
                  )}
                </div>

                {showTransfer && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-indigo-50/80 p-3 ring-1 ring-indigo-100">
                    <label className="min-w-[12rem] flex-1 text-xs font-semibold text-indigo-900">
                      {t(locale, "transferOwnershipPick")}
                      <select
                        value={transferTarget}
                        onChange={(e) => setTransferTarget(e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-indigo-200 bg-white px-2 text-sm text-slate-800"
                      >
                        <option value="">—</option>
                        {otherMembers.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {profiles[m.user_id]?.display_name ||
                              m.nickname ||
                              m.user_id.slice(0, 8)}{" "}
                            ({roleLabel(locale, m.role)})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={pending || !transferTarget}
                      onClick={() => onTransfer(s.id)}
                      className="h-9 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {t(locale, "transferOwnership")}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setTransferFor(null);
                        setTransferTarget("");
                      }}
                      className="h-9 rounded-xl bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                    >
                      {t(locale, "cancel")}
                    </button>
                  </div>
                )}

                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t(locale, "members")}
                </h4>
                <ul className="mt-2 space-y-1">
                  {(membersBySpace[s.id] ?? []).map((m) => (
                    <li
                      key={m.user_id}
                      className="flex justify-between text-sm text-slate-700"
                    >
                      <span>
                        {profiles[m.user_id]?.display_name ||
                          m.nickname ||
                          m.user_id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {roleLabel(locale, m.role)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <LimitWallModal
        locale={locale}
        kind={wallKind}
        open={wallOpen}
        onClose={() => {
          setWallOpen(false);
          setWallKind(null);
        }}
      />
    </div>
  );
}
