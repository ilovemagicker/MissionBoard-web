"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
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
import {
  joinAsScheduleViewerAction,
  lookupScheduleShareCodeAction,
} from "@/app/actions/schedule-share";
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
  initialInvite,
  initialFamilyCode,
}: {
  locale: Locale;
  spaces: SpaceWithRole[];
  membersBySpace: Record<
    string,
    { user_id: string; role: string; nickname: string | null }[]
  >;
  profiles: Record<string, ProfileRow>;
  pendingRequests: (JoinRequestRow & { space_name?: string })[];
  /** Prefill from `/app/spaces?invite=` deep link */
  initialInvite?: string;
  /** Prefill from `/app/spaces?family=` deep link */
  initialFamilyCode?: string;
}) {
  const router = useRouter();
  const { entitlements, ready } = useEntitlements();
  const [pending, startTransition] = useTransition();
  const hasDeepLink = !!(
    (initialInvite && initialInvite.trim()) ||
    (initialFamilyCode && initialFamilyCode.trim())
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    hasDeepLink ? t(locale, "deepLinkAutoRedeeming") : null
  );
  const [name, setName] = useState("");
  const [invite, setInvite] = useState(initialInvite ?? "");
  const [familyCode, setFamilyCode] = useState(initialFamilyCode ?? "");
  const [familyPreview, setFamilyPreview] = useState<string | null>(null);
  const [autoRedeeming, setAutoRedeeming] = useState(hasDeepLink);
  const [transferFor, setTransferFor] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [wallKind, setWallKind] = useState<LimitKind | null>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    spaces[0]?.id ?? null
  );
  const [showCreateJoin, setShowCreateJoin] = useState(spaces.length === 0);
  const autoRedeemOnce = useRef(false);

  useEffect(() => {
    if (selectedId && spaces.some((s) => s.id === selectedId)) return;
    setSelectedId(spaces[0]?.id ?? null);
  }, [spaces, selectedId]);

  function openWall(kind: LimitKind) {
    setWallKind(kind);
    setWallOpen(true);
  }

  function stripDeepLinkQuery() {
    router.replace("/app/spaces", { scroll: false });
  }

  function joinInviteInfo(res: {
    spaceName?: string;
    alreadyMember?: boolean;
    alreadyPending?: boolean;
  }) {
    const name = res.spaceName || "";
    if (res.alreadyMember) {
      return t(locale, "deepLinkInviteAlreadyMember").replace("{name}", name);
    }
    if (res.alreadyPending) {
      return t(locale, "deepLinkInviteAlreadyPending").replace("{name}", name);
    }
    return t(locale, "deepLinkInviteRequested").replace("{name}", name);
  }

  // Deep link: auto-redeem invite / family code once, then clear query.
  useEffect(() => {
    if (autoRedeemOnce.current) return;
    const inviteCode = (initialInvite ?? "").trim();
    const family = (initialFamilyCode ?? "").trim();
    if (!inviteCode && !family) return;
    autoRedeemOnce.current = true;

    let cancelled = false;
    (async () => {
      setError(null);
      setInfo(t(locale, "deepLinkAutoRedeeming"));
      setAutoRedeeming(true);
      try {
        if (family) {
          const looked = await lookupScheduleShareCodeAction(family);
          if (cancelled) return;
          if (looked.error) {
            setError(looked.error);
            setInfo(null);
            stripDeepLinkQuery();
            return;
          }
          const spaceName = looked.spaceName ?? "";
          if (spaceName) setFamilyPreview(spaceName);
          const res = await joinAsScheduleViewerAction(family);
          if (cancelled) return;
          if (!res.ok) {
            setError(res.error);
            setInfo(null);
            stripDeepLinkQuery();
            return;
          }
          setFamilyCode("");
          setFamilyPreview(null);
          const label = spaceName || res.spaceName || res.spaceId || "";
          setInfo(
            res.alreadyMember
              ? t(locale, "deepLinkFamilyAlreadyMember").replace(
                  "{name}",
                  label
                )
              : t(locale, "scheduleRedeemSuccess").replace("{name}", label)
          );
          // Leave /app/spaces?family= behind by navigating to schedule (no replace race).
          router.replace("/app/schedule");
          router.refresh();
          return;
        }

        const fd = new FormData();
        fd.set("invite_code", inviteCode);
        const res = await joinByInviteAction(fd);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          setInfo(null);
          stripDeepLinkQuery();
          return;
        }
        setInvite("");
        setInfo(joinInviteInfo(res));
        stripDeepLinkQuery();
        router.refresh();
      } finally {
        if (!cancelled) setAutoRedeeming(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInvite, initialFamilyCode]);

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
    // Soft wall: owned non-archived spaces only (022 SPACE_LIMIT).
    const ownedCount = spaces.filter(
      (s) => s.role === "owner" && !s.archived_at
    ).length;
    if (ready) {
      const check = precheckCreateSpace(entitlements, ownedCount);
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
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.set("invite_code", invite);
    startTransition(async () => {
      const res = await joinByInviteAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInvite("");
      setInfo(joinInviteInfo(res));
      router.refresh();
    });
  }

  function onLookupFamily() {
    setError(null);
    setInfo(null);
    setFamilyPreview(null);
    startTransition(async () => {
      const res = await lookupScheduleShareCodeAction(familyCode);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.spaceName) {
        setFamilyPreview(res.spaceName);
        setInfo(
          t(locale, "scheduleRedeemPreview").replace("{name}", res.spaceName)
        );
      }
    });
  }

  function onRedeemFamily(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const looked = await lookupScheduleShareCodeAction(familyCode);
      const spaceName =
        looked.spaceName ?? familyPreview ?? "";
      const res = await joinAsScheduleViewerAction(familyCode);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFamilyCode("");
      setFamilyPreview(null);
      const label = spaceName || res.spaceName || res.spaceId || "";
      setInfo(
        res.alreadyMember
          ? t(locale, "deepLinkFamilyAlreadyMember").replace("{name}", label)
          : t(locale, "scheduleRedeemSuccess").replace("{name}", label)
      );
      router.refresh();
      router.push("/app/schedule");
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {t(locale, "spaces")}
        </h1>
        <button
          type="button"
          onClick={() => setShowCreateJoin((v) => !v)}
          className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {showCreateJoin ? t(locale, "close") : t(locale, "createSpace") + " / " + t(locale, "joinSpace")}
        </button>
      </div>

      {showCreateJoin ? (
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <form
          onSubmit={onCreate}
          className="rounded-lg border border-slate-200 bg-white p-4"
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
            className="mt-3 h-9 w-full rounded-md bg-brand text-sm font-semibold text-white"
          >
            {t(locale, "create")}
          </button>
        </form>

        <form
          onSubmit={onJoin}
          className="rounded-lg border border-slate-200 bg-white p-4"
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
            disabled={pending || autoRedeeming}
            className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800"
          >
            {autoRedeeming && invite.trim()
              ? t(locale, "deepLinkAutoRedeeming")
              : t(locale, "submitJoin")}
          </button>
        </form>

        <form
          onSubmit={onRedeemFamily}
          className="rounded-lg border border-indigo-200 bg-white p-4"
        >
          <h2 className="text-sm font-semibold text-indigo-700">
            {t(locale, "scheduleRedeemTitle")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {t(locale, "scheduleRedeemHint")}
          </p>
          <input
            value={familyCode}
            onChange={(e) => {
              setFamilyCode(e.target.value.toUpperCase());
              setFamilyPreview(null);
            }}
            required
            placeholder={t(locale, "scheduleRedeemPlaceholder")}
            className="mt-3 h-10 w-full rounded-xl border border-indigo-100 px-3 font-mono text-sm uppercase tracking-wide"
          />
          {familyPreview ? (
            <p className="mt-2 text-xs font-medium text-indigo-800">
              {t(locale, "scheduleRedeemPreview").replace(
                "{name}",
                familyPreview
              )}
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending || autoRedeeming || !familyCode.trim()}
              onClick={onLookupFamily}
              className="h-10 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-800 disabled:opacity-60"
            >
              {t(locale, "scheduleRedeemLookup")}
            </button>
            <button
              type="submit"
              disabled={pending || autoRedeeming || !familyCode.trim()}
              className="h-10 rounded-xl bg-indigo-600 text-sm font-semibold text-white disabled:opacity-60"
            >
              {autoRedeeming && familyCode.trim()
                ? t(locale, "deepLinkAutoRedeeming")
                : t(locale, "scheduleRedeemJoin")}
            </button>
          </div>
        </form>
      </section>
      ) : null}

      {pendingRequests.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
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

      {spaces.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          {t(locale, "noSpaces")}
        </p>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-4 lg:items-start">
          <ul className="mb-3 overflow-hidden rounded-lg border border-slate-200 bg-white lg:mb-0">
            {spaces.map((s) => {
              const active = s.id === selectedId;
              return (
                <li key={s.id} className="border-b border-slate-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm ${
                      active
                        ? "bg-brand/10 text-brand"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 truncate font-medium">{s.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {roleLabel(locale, s.role)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div>
            {(() => {
              const s = spaces.find((x) => x.id === selectedId) ?? spaces[0];
              if (!s) return null;
              const archived = !!s.archived_at;
              const isOwner = s.role === "owner";
              const otherMembers = (membersBySpace[s.id] ?? []).filter(
                (m) => m.role !== "owner"
              );
              const showTransfer = transferFor === s.id;
              return (
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {s.name}
                        {archived && (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
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
                            className="rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"
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
                          className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          {archived
                            ? t(locale, "unarchiveSpace")
                            : t(locale, "archiveSpace")}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (!window.confirm(t(locale, "deleteSpaceConfirm")))
                              return;
                            run(() => deleteSpaceAction(s.id));
                          }}
                          className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                        >
                          {t(locale, "deleteSpace")}
                        </button>
                      </div>
                    )}
                  </div>

                  {showTransfer && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-indigo-50/80 p-3 ring-1 ring-indigo-100">
                      <label className="min-w-[12rem] flex-1 text-xs font-semibold text-indigo-900">
                        {t(locale, "transferOwnershipPick")}
                        <select
                          value={transferTarget}
                          onChange={(e) => setTransferTarget(e.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-indigo-200 bg-white px-2 text-sm text-slate-800"
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
                        className="h-9 rounded-md bg-indigo-600 px-4 text-xs font-semibold text-white disabled:opacity-50"
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
                        className="h-9 rounded-md bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                      >
                        {t(locale, "cancel")}
                      </button>
                    </div>
                  )}

                  <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t(locale, "members")}
                  </h4>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {(membersBySpace[s.id] ?? []).map((m) => (
                      <li
                        key={m.user_id}
                        className="flex justify-between py-1.5 text-sm text-slate-700"
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
            })()}
          </div>
        </div>
      )}

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
