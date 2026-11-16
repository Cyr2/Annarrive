import type { ChatContext, ChatWidget, HealthStatus, PlannedSession, ProfilePatch } from "@talaria/protocol";

/** A tool call to expect: input keys must match; an array lists the accepted values. */
export type CallMatcher = { name: string; input?: Record<string, unknown> };

export type Scenario = {
  id: string;
  /** What the scenario checks, in a few words. */
  title: string;
  message: string;
  context?: ChatContext;
  /** Earlier turns of the thread, oldest first. */
  history?: { role: "anna" | "reggie"; text: string }[];
  seed?: { sessions?: PlannedSession[]; profile?: ProfilePatch; health?: HealthStatus };
  expect: {
    /** Every matcher needs one call. */
    calls?: CallMatcher[];
    /** At least one of these tool names is called. */
    anyOf?: string[];
    /** None of these tool names is called. */
    forbidden?: string[];
    widgets?: ChatWidget["type"][];
    textMatches?: RegExp[];
    textForbids?: RegExp[];
  };
};

export type Transcript = {
  calls: { name: string; input: unknown }[];
  text: string;
  widgets: ChatWidget[];
  error?: string;
};
export type Grade = { pass: boolean; reasons: string[] };

export const MODIFYING = [
  "move_session",
  "change_session",
  "report_unavailable",
  "feel_better",
  "update_setting",
] as const;

const KNOWN = new Set([
  "get_today",
  "get_week",
  "get_program",
  "get_recent",
  "propose_move_slots",
  "change_options",
  "ask_choice",
  "ask_level",
  "WebSearch",
  "WebFetch",
  ...MODIFYING,
]);

/** Tone rules of docs/interactions.md and the never-diagnose rule, checked on every reply. */
const STYLE: [RegExp, string][] = [
  [/[–—]/, "tiret long ou demi-tiret"],
  [/\p{Extended_Pictographic}/u, "emoji"],
  [/!\s*!/, "points d'exclamation en série"],
  [/\btu (as|souffres d'|fais) (une?|des) (tendinite|fracture|déchirure|claquage|périostite|entorse)/i, "diagnostic"],
];
const MAX_REPLY_CHARS = 700;

function matches(call: { name: string; input: unknown }, matcher: CallMatcher): boolean {
  if (call.name !== matcher.name) return false;
  const input = typeof call.input === "object" && call.input !== null ? call.input : {};
  return Object.entries(matcher.input ?? {}).every(([key, expected]) => {
    const actual: unknown = Object.entries(input).find(([k]) => k === key)?.[1];
    return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  });
}

function callReasons(expect: Scenario["expect"], transcript: Transcript): string[] {
  const names = transcript.calls.map((c) => c.name);
  const { calls = [], anyOf, forbidden = [], widgets = [] } = expect;
  const missingAny = anyOf && !anyOf.some((n) => names.includes(n));
  return [
    ...calls
      .filter((m) => !transcript.calls.some((c) => matches(c, m)))
      .map((m) => `appel attendu : ${m.name}${m.input ? ` ${JSON.stringify(m.input)}` : ""}`),
    ...(missingAny ? [`un appel parmi : ${anyOf.join(", ")}`] : []),
    ...forbidden.filter((n) => names.includes(n)).map((n) => `appel interdit : ${n}`),
    ...names.filter((n) => !KNOWN.has(n)).map((n) => `outil inconnu : ${n}`),
    ...widgets.filter((w) => !transcript.widgets.some((x) => x.type === w)).map((w) => `widget attendu : ${w}`),
  ];
}

function textReasons(expect: Scenario["expect"], text: string): string[] {
  const reasons: string[] = [];
  if (text.trim() === "") reasons.push("réponse vide");
  if (text.length > MAX_REPLY_CHARS) reasons.push(`réponse trop longue (${text.length} caractères)`);
  for (const [pattern, label] of STYLE) if (pattern.test(text)) reasons.push(`style : ${label}`);
  for (const r of expect.textMatches ?? []) if (!r.test(text)) reasons.push(`texte attendu : ${r}`);
  for (const r of expect.textForbids ?? []) if (r.test(text)) reasons.push(`texte interdit : ${r}`);
  return reasons;
}

export function grade(scenario: Scenario, transcript: Transcript): Grade {
  if (transcript.error) return { pass: false, reasons: [`erreur : ${transcript.error}`] };
  const reasons = [...callReasons(scenario.expect, transcript), ...textReasons(scenario.expect, transcript.text)];
  return { pass: reasons.length === 0, reasons };
}

/** One line per scenario, then the total. */
export function table(rows: { scenario: Scenario; grade: Grade; calls: string[] }[]): string {
  const width = Math.max(...rows.map((r) => r.scenario.id.length), 2);
  const lines = rows.map(({ scenario, grade: g, calls }) => {
    const status = g.pass ? "OK   " : "ÉCHEC";
    const detail = g.pass ? calls.join(", ") || "aucun outil" : g.reasons.join(" ; ");
    return `${scenario.id.padEnd(width)}  ${status}  ${detail}`;
  });
  const passed = rows.filter((r) => r.grade.pass).length;
  return [...lines, "", `${passed}/${rows.length} scénarios passent`].join("\n");
}
