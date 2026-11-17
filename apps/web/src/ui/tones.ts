import type { IconName } from "./Icon.tsx";

/** What a session or a calendar item is. Its three tones come from tokens.css. */
export type Tone = "hard" | "easy" | "long" | "class" | "revision" | "strength" | "busy" | "rest" | "other";

type ToneStyle = {
  /** Background of a row, a chip or a card corner. */ wash: string;
  /** Bars and dots. */ mid: string;
  /** Text and icons on white or on the wash (4.5:1). */ deep: string;
  /** What the chip says. */ label: string;
  icon: IconName;
};

// Written out in full so Tailwind finds every class in the source.
export const TONES: Record<Tone, ToneStyle> = {
  hard: { wash: "bg-intense-wash", mid: "bg-intense", deep: "text-intense-deep", label: "Intense", icon: "run" },
  easy: { wash: "bg-easy-wash", mid: "bg-easy", deep: "text-easy-deep", label: "Facile", icon: "run" },
  long: { wash: "bg-long-wash", mid: "bg-long", deep: "text-long-deep", label: "Longue", icon: "run" },
  revision: {
    wash: "bg-revision-wash",
    mid: "bg-revision",
    deep: "text-revision-deep",
    label: "Révision",
    icon: "revision",
  },
  strength: {
    wash: "bg-strength-wash",
    mid: "bg-strength",
    deep: "text-strength-deep",
    label: "Muscu",
    icon: "strength",
  },
  class: { wash: "bg-class-wash", mid: "bg-class", deep: "text-class-deep", label: "Cours", icon: "class" },
  busy: { wash: "bg-class-wash", mid: "bg-class", deep: "text-class-deep", label: "Indispo", icon: "busy" },
  rest: { wash: "bg-class-wash", mid: "bg-class", deep: "text-class-deep", label: "Repos", icon: "moon" },
  other: { wash: "bg-class-wash", mid: "bg-class", deep: "text-class-deep", label: "Autre", icon: "info" },
};
