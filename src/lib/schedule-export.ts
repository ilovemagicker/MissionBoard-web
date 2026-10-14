import {
  daysInMonth,
  mondayFirstWeekday,
  startOfMonth,
  toDateKey,
} from "@/lib/calendar";
import type { ProfileRow, ShiftRow } from "@/lib/types";

export type ExportMember = {
  user_id: string;
  role: string;
  nickname: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** ICS floating local datetime YYYYMMDDTHHMMSS */
export function toIcsLocal(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

export function toIcsUtcStamp(d = new Date()): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

export function memberDisplayName(
  userId: string,
  members: ExportMember[],
  profiles: Record<string, ProfileRow>,
  fallback: string
): string {
  const nick = members.find((m) => m.user_id === userId)?.nickname?.trim();
  if (nick) return nick;
  const name = profiles[userId]?.display_name?.trim();
  if (name) return name;
  return fallback;
}

export function monthBounds(cursorMonth: Date): { start: Date; end: Date } {
  const start = startOfMonth(cursorMonth);
  const end = new Date(
    cursorMonth.getFullYear(),
    cursorMonth.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  return { start, end };
}

export function filterShiftsForExport(
  shifts: ShiftRow[],
  opts: {
    cursorMonth: Date;
    userIds: string[] | "all";
  }
): ShiftRow[] {
  const { start, end } = monthBounds(opts.cursorMonth);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const allow =
    opts.userIds === "all" ? null : new Set(opts.userIds.filter(Boolean));
  return shifts
    .filter((s) => {
      if (s.status && s.status !== "scheduled") return false;
      const t0 = new Date(s.start_at).getTime();
      if (t0 < startMs || t0 > endMs) return false;
      if (allow && !allow.has(s.user_id)) return false;
      return true;
    })
    .slice()
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
}

export function buildIcsCalendar(opts: {
  shifts: ShiftRow[];
  members: ExportMember[];
  profiles: Record<string, ProfileRow>;
  spaceName: string;
  memberFallback: string;
  eventPrefix: string;
}): string {
  const stamp = toIcsUtcStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Work Assistants//Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcsLine(`X-WR-CALNAME:${icsEscape(opts.spaceName)}`),
  ];

  for (const s of opts.shifts) {
    const start = new Date(s.start_at);
    const end = new Date(s.end_at);
    const who = memberDisplayName(
      s.user_id,
      opts.members,
      opts.profiles,
      opts.memberFallback
    );
    const title = (s.title ?? "").trim();
    const summary = title
      ? `${opts.eventPrefix}: ${title} (${who})`
      : `${opts.eventPrefix}: ${who}`;
    const descParts: string[] = [who];
    if (s.note?.trim()) descParts.push(s.note.trim());
    const uid = `${s.id}@workassistants.schedule`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toIcsLocal(start)}`);
    lines.push(`DTEND:${toIcsLocal(end)}`);
    lines.push(foldIcsLine(`SUMMARY:${icsEscape(summary)}`));
    lines.push(foldIcsLine(`DESCRIPTION:${icsEscape(descParts.join("\n"))}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime: string
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0").slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 59, g: 130, b: 246 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export type RosterImageLabels = {
  title: string;
  weekdays: string[];
  memberFallback: string;
  filterLabel?: string;
  brand: string;
};

/** Draw a printable month roster PNG (no external deps). */
export function renderMonthRosterPng(opts: {
  cursorMonth: Date;
  shifts: ShiftRow[];
  members: ExportMember[];
  profiles: Record<string, ProfileRow>;
  labels: RosterImageLabels;
  /** Members to show as rows; empty = derive from shifts + members list */
  rowUserIds: string[];
}): Promise<Blob> {
  const { cursorMonth, shifts, members, profiles, labels } = opts;
  const rowIds =
    opts.rowUserIds.length > 0
      ? opts.rowUserIds
      : members.filter((m) => m.role !== "viewer").map((m) => m.user_id);

  const cellW = 92;
  const nameW = 110;
  const headerH = 72;
  const dayHeaderH = 28;
  const rowH = 56;
  const pad = 24;
  const days = daysInMonth(cursorMonth);
  const lead = mondayFirstWeekday(startOfMonth(cursorMonth));
  const totalCells = Math.ceil((lead + days) / 7) * 7;
  const weeks = totalCells / 7;
  const gridW = nameW + 7 * cellW;
  const width = pad * 2 + gridW;
  const membersPerWeekBlock = Math.max(1, rowIds.length || 1);
  const weekBlockH = dayHeaderH + membersPerWeekBlock * rowH;
  const canvasH = pad * 2 + headerH + weeks * weekBlockH + 16;

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = canvasH * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas unsupported"));
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, canvasH);

  // Title
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(labels.title, pad, pad + 28);
  ctx.font = "13px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#64748b";
  const sub = [labels.brand, labels.filterLabel].filter(Boolean).join(" · ");
  if (sub) ctx.fillText(sub, pad, pad + 50);

  const shiftsByDay = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const key = toDateKey(new Date(s.start_at));
    const list = shiftsByDay.get(key) ?? [];
    list.push(s);
    shiftsByDay.set(key, list);
  }

  let y = pad + headerH;
  for (let w = 0; w < weeks; w++) {
    // Weekday header
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(pad + nameW, y, 7 * cellW, dayHeaderH);
    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(pad + nameW, y, 7 * cellW, dayHeaderH);
    ctx.font = "600 12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#475569";
    for (let d = 0; d < 7; d++) {
      const label = labels.weekdays[d] ?? "";
      const tx = pad + nameW + d * cellW + 8;
      ctx.fillText(label, tx, y + 18);
    }

    // Name column header spacer
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(pad, y, nameW, dayHeaderH);
    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(pad, y, nameW, dayHeaderH);

    y += dayHeaderH;

    const rows = rowIds.length > 0 ? rowIds : ["__empty__"];
    for (const userId of rows) {
      const name =
        userId === "__empty__"
          ? "—"
          : memberDisplayName(
              userId,
              members,
              profiles,
              labels.memberFallback
            );
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(pad, y, nameW, rowH);
      ctx.strokeStyle = "#e2e8f0";
      ctx.strokeRect(pad, y, nameW, rowH);
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 12px system-ui, -apple-system, sans-serif";
      const clipped =
        name.length > 12 ? name.slice(0, 11) + "…" : name;
      ctx.fillText(clipped, pad + 8, y + 22);

      for (let d = 0; d < 7; d++) {
        const cellIndex = w * 7 + d;
        const dayNum = cellIndex - lead + 1;
        const x = pad + nameW + d * cellW;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, cellW, rowH);
        ctx.strokeStyle = "#e2e8f0";
        ctx.strokeRect(x, y, cellW, rowH);

        if (dayNum < 1 || dayNum > days) {
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(x, y, cellW, rowH);
          ctx.strokeStyle = "#e2e8f0";
          ctx.strokeRect(x, y, cellW, rowH);
          continue;
        }

        const date = new Date(
          cursorMonth.getFullYear(),
          cursorMonth.getMonth(),
          dayNum
        );
        const key = toDateKey(date);
        const isWeekend = d >= 5;
        ctx.fillStyle = isWeekend ? "#fff7ed" : "#ffffff";
        ctx.fillRect(x, y, cellW, rowH);
        ctx.strokeStyle = "#e2e8f0";
        ctx.strokeRect(x, y, cellW, rowH);

        ctx.fillStyle = isWeekend ? "#c2410c" : "#64748b";
        ctx.font = "11px system-ui, -apple-system, sans-serif";
        ctx.fillText(String(dayNum), x + 6, y + 14);

        if (userId === "__empty__") continue;
        const dayShifts = (shiftsByDay.get(key) ?? []).filter(
          (s) => s.user_id === userId
        );
        let chipY = y + 20;
        for (const s of dayShifts.slice(0, 2)) {
          const rgb = hexToRgb(s.color || "#3B82F6");
          ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
          roundRect(ctx, x + 4, chipY, cellW - 8, 16, 4);
          ctx.fill();
          ctx.fillStyle = s.text_color || "#ffffff";
          ctx.font = "600 10px system-ui, -apple-system, sans-serif";
          const label =
            (s.title ?? "").trim() ||
            `${formatHm(s.start_at)}–${formatHm(s.end_at)}`;
          const short =
            label.length > 10 ? label.slice(0, 9) + "…" : label;
          ctx.fillText(short, x + 8, chipY + 12);
          chipY += 18;
        }
        if (dayShifts.length > 2) {
          ctx.fillStyle = "#94a3b8";
          ctx.font = "10px system-ui, -apple-system, sans-serif";
          ctx.fillText(`+${dayShifts.length - 2}`, x + 8, chipY + 10);
        }
      }
      y += rowH;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("PNG encode failed"));
        else resolve(blob);
      },
      "image/png",
      0.92
    );
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function monthFileStamp(cursorMonth: Date): string {
  return `${cursorMonth.getFullYear()}-${pad2(cursorMonth.getMonth() + 1)}`;
}
