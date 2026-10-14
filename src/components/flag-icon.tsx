"use client";

import {
  DEFAULT_FLAG_ICON,
  MISSION_FLAG_ICONS,
  resolveFlagIcon,
} from "@/lib/flag-icons";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function MissionFlagIconView({
  flagIcon,
  size = 32,
  className = "",
}: {
  flagIcon: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const def = resolveFlagIcon(flagIcon);
  const fontSize = Math.round(size * 0.5);
  return (
    <span
      role="img"
      aria-label={def.a11yLabel}
      title={def.a11yLabel}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-blue-50 text-center leading-none ring-1 ring-blue-100 ${className}`}
      style={{ width: size, height: size, fontSize }}
    >
      {def.emoji}
    </span>
  );
}

export function FlagIconPicker({
  value,
  onChange,
  locale,
  columns = 5,
  name,
  showTitle = true,
}: {
  value: string;
  onChange: (next: string) => void;
  locale: Locale;
  columns?: number;
  /** Optional hidden input name for form submit */
  name?: string;
  showTitle?: boolean;
}) {
  const selected = resolveFlagIcon(value).rawValue;
  return (
    <div className="space-y-2">
      {showTitle && (
        <p className="text-sm font-medium text-slate-700">
          {t(locale, "flagIconSection")}
        </p>
      )}
      {name && <input type="hidden" name={name} value={selected} />}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="listbox"
        aria-label={t(locale, "flagIconSection")}
      >
        {MISSION_FLAG_ICONS.map((icon) => {
          const active = selected === icon.rawValue;
          return (
            <button
              key={icon.rawValue}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={icon.a11yLabel}
              title={icon.a11yLabel}
              onClick={() => onChange(icon.rawValue)}
              className={`flex h-11 items-center justify-center rounded-xl text-lg transition ${
                active
                  ? "bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-1"
                  : "bg-slate-100 text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200"
              }`}
            >
              {icon.emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { DEFAULT_FLAG_ICON };
