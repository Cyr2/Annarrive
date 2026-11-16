import type { IconName } from "./Icon.tsx";

/** Colors of a session or calendar kind, as Tailwind classes built from the tokens. */
export type Tone = "hard" | "easy" | "long" | "class" | "revision" | "strength" | "busy" | "rest" | "other";

type ToneStyle = {
  /** Pale row or card background. */ wash: string;
  /** Square icon tile in a list. */ tile: string;
  /** Strong text on the wash. */ deep: string;
  /** Secondary text on the wash. */ ink: string;
  /** Week dot. */ dot: string;
  icon: IconName;
};

// Written out in full so Tailwind finds every class in the source.
export const TONES: Record<Tone, ToneStyle> = {
  hard: {
    wash: "bg-intense-wash",
    tile: "bg-intense text-on-accent",
    deep: "text-intense-deep",
    ink: "text-intense-ink",
    dot: "bg-intense",
    icon: "run",
  },
  easy: {
    wash: "bg-easy-wash",
    tile: "bg-easy text-on-accent",
    deep: "text-easy-deep",
    ink: "text-easy-ink",
    dot: "bg-intense",
    icon: "run",
  },
  long: {
    wash: "bg-long-wash",
    tile: "bg-long text-on-accent",
    deep: "text-long-deep",
    ink: "text-long-ink",
    dot: "bg-intense",
    icon: "run",
  },
  class: {
    wash: "bg-transparent",
    tile: "bg-class-wash text-class-ink",
    deep: "text-text",
    ink: "text-class-ink",
    dot: "bg-class",
    icon: "class",
  },
  revision: {
    wash: "bg-transparent",
    tile: "bg-revision-wash text-revision-ink",
    deep: "text-text",
    ink: "text-revision-ink",
    dot: "bg-revision",
    icon: "revision",
  },
  strength: {
    wash: "bg-transparent",
    tile: "bg-class-wash text-class-ink",
    deep: "text-text",
    ink: "text-class-ink",
    dot: "bg-strength",
    icon: "strength",
  },
  busy: {
    wash: "bg-transparent",
    tile: "bg-class-wash text-class-ink",
    deep: "text-text",
    ink: "text-class-ink",
    dot: "bg-class",
    icon: "busy",
  },
  rest: {
    wash: "bg-fill",
    tile: "bg-class-wash text-class-ink",
    deep: "text-text",
    ink: "text-class-ink",
    dot: "bg-class",
    icon: "moon",
  },
  other: {
    wash: "bg-fill",
    tile: "bg-class-wash text-class-ink",
    deep: "text-text",
    ink: "text-class-ink",
    dot: "bg-class",
    icon: "info",
  },
};
