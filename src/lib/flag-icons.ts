/**
 * Mission flag icons — raw values match iOS `MissionFlagIcon` (SF Symbol names).
 * Web displays emoji equivalents; unknown values fall back to the default.
 */

export type MissionFlagIconId =
  | "flag.fill"
  | "star.fill"
  | "flame.fill"
  | "bolt.fill"
  | "target"
  | "bookmark.fill"
  | "heart.fill"
  | "trophy.fill"
  | "map.fill"
  | "shield.fill"
  | "airplane"
  | "bell.fill"
  | "leaf.fill"
  | "moon.fill"
  | "sun.max.fill"
  | "puzzlepiece.fill"
  | "hammer.fill"
  | "lightbulb.fill"
  | "person.2.fill"
  | "flag.checkered";

export type FlagIconDef = {
  id: MissionFlagIconId;
  /** SF Symbol / DB raw value */
  rawValue: MissionFlagIconId;
  emoji: string;
  /** Short English a11y label (stable across locales) */
  a11yLabel: string;
};

export const DEFAULT_FLAG_ICON: MissionFlagIconId = "flag.fill";

export const MISSION_FLAG_ICONS: readonly FlagIconDef[] = [
  { id: "flag.fill", rawValue: "flag.fill", emoji: "🚩", a11yLabel: "Flag" },
  { id: "star.fill", rawValue: "star.fill", emoji: "⭐", a11yLabel: "Star" },
  { id: "flame.fill", rawValue: "flame.fill", emoji: "🔥", a11yLabel: "Flame" },
  { id: "bolt.fill", rawValue: "bolt.fill", emoji: "⚡", a11yLabel: "Bolt" },
  { id: "target", rawValue: "target", emoji: "🎯", a11yLabel: "Target" },
  {
    id: "bookmark.fill",
    rawValue: "bookmark.fill",
    emoji: "🔖",
    a11yLabel: "Bookmark",
  },
  { id: "heart.fill", rawValue: "heart.fill", emoji: "❤️", a11yLabel: "Heart" },
  {
    id: "trophy.fill",
    rawValue: "trophy.fill",
    emoji: "🏆",
    a11yLabel: "Trophy",
  },
  { id: "map.fill", rawValue: "map.fill", emoji: "🗺️", a11yLabel: "Map" },
  {
    id: "shield.fill",
    rawValue: "shield.fill",
    emoji: "🛡️",
    a11yLabel: "Shield",
  },
  { id: "airplane", rawValue: "airplane", emoji: "✈️", a11yLabel: "Airplane" },
  { id: "bell.fill", rawValue: "bell.fill", emoji: "🔔", a11yLabel: "Bell" },
  { id: "leaf.fill", rawValue: "leaf.fill", emoji: "🍃", a11yLabel: "Leaf" },
  { id: "moon.fill", rawValue: "moon.fill", emoji: "🌙", a11yLabel: "Moon" },
  {
    id: "sun.max.fill",
    rawValue: "sun.max.fill",
    emoji: "☀️",
    a11yLabel: "Sun",
  },
  {
    id: "puzzlepiece.fill",
    rawValue: "puzzlepiece.fill",
    emoji: "🧩",
    a11yLabel: "Puzzle",
  },
  {
    id: "hammer.fill",
    rawValue: "hammer.fill",
    emoji: "🔨",
    a11yLabel: "Hammer",
  },
  {
    id: "lightbulb.fill",
    rawValue: "lightbulb.fill",
    emoji: "💡",
    a11yLabel: "Lightbulb",
  },
  {
    id: "person.2.fill",
    rawValue: "person.2.fill",
    emoji: "👥",
    a11yLabel: "People",
  },
  {
    id: "flag.checkered",
    rawValue: "flag.checkered",
    emoji: "🏁",
    a11yLabel: "Checkered flag",
  },
] as const;

const BY_RAW = new Map(
  MISSION_FLAG_ICONS.map((d) => [d.rawValue, d] as const)
);

export function resolveFlagIcon(raw: string | null | undefined): FlagIconDef {
  if (raw && BY_RAW.has(raw as MissionFlagIconId)) {
    return BY_RAW.get(raw as MissionFlagIconId)!;
  }
  return BY_RAW.get(DEFAULT_FLAG_ICON)!;
}

export function isMissionFlagIconId(raw: string): raw is MissionFlagIconId {
  return BY_RAW.has(raw as MissionFlagIconId);
}
