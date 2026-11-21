import type { PlannedSession } from "./api.ts";

type Shape = Pick<PlannedSession, "type" | "durMin" | "steps">;

/** A footing shorter than the catalogue's 30 min (deload, race week) or near the long run's length (P15). */
const SHORT_E_MIN = 30;
const LONG_E_MIN = 60;
/** The race week's reminder (P18): 2 × 1 km at race pace, about 10 min of work. */
const REMINDER_WORK_MIN = 12;

const WHY = {
  E: "Tu cours à l'aise : tu bâtis ton endurance et tu récupères en même temps.",
  shortE: "Court exprès : tes jambes restent en route et tu gardes ta fraîcheur.",
  longE: "Un footing plus long que d'habitude, à l'aise : tu ajoutes de l'endurance au milieu de la semaine.",
  strides: "Tu finis par des accélérations de 20 secondes : ta foulée reste vive.",
  sprints: "Des accélérations de 10 secondes, récupérées en trottinant : tu réveilles ta vitesse et ta foulée.",
  RECUP: "Tu bouges les jambes pour récupérer de la séance d'avant.",
  L: "Tu habitues ton corps à durer, à allure facile.",
  raceFinish:
    "Tu finis à l'allure de ton objectif sur des jambes fatiguées, comme dans les derniers kilomètres du jour J.",
  fastFinish: "Tu cours les dernières minutes plus vite : tu apprends à relancer quand la fatigue arrive.",
  T: "Tu tiens une allure soutenue d'une traite : tu repousses le moment où ça devient dur.",
  CRUISE: "La même allure soutenue, en blocs avec une courte pause : tu en tiens plus longtemps qu'en continu.",
  I: "Tu cours vite par efforts de quelques minutes : ton plafond monte et l'allure de ton objectif te paraîtra plus facile.",
  R: "Tu cours très vite sur des efforts courts : tu gagnes en vitesse et en foulée.",
  SPE: "Tu cours des blocs à l'allure de ton objectif, pour qu'elle te soit naturelle le jour J.",
  reminder:
    "Deux rappels courts à l'allure de ton objectif : tes jambes la gardent en mémoire et restent fraîches pour le jour J.",
  FARTLEK:
    "Une minute vite à l'allure affichée sur ta montre, une minute facile : tu apprends à changer d'allure sans t'arrêter.",
  TEST: "Tu cours 20 minutes à fond : ton chrono règle tes allures des semaines suivantes.",
  RACE: "Le jour J. Pars à ton allure, pas plus vite.",
} as const;

const has = (s: Shape, kind: string, zone?: string): boolean =>
  s.steps.some((st) => st.kind === kind && (zone === undefined || st.zone === zone));
const workMin = (s: Shape): number =>
  s.steps.filter((st) => st.kind === "work").reduce((sum, st) => sum + (st.durMin ?? 0) * (st.reps ?? 1), 0);

function easyWhy(s: Shape): string {
  if (has(s, "strides")) return has(s, "work") ? WHY.strides : WHY.sprints;
  if (s.durMin < SHORT_E_MIN) return WHY.shortE;
  return s.durMin >= LONG_E_MIN ? WHY.longE : WHY.E;
}

/** Why the session is there, read from what it holds: the app and Reggie say the same (B4 of the audit). */
export function sessionWhy(s: Shape): string {
  switch (s.type) {
    case "E":
      return easyWhy(s);
    case "L":
      return has(s, "work", "race") ? WHY.raceFinish : has(s, "work", "M") ? WHY.fastFinish : WHY.L;
    case "SPE":
      return workMin(s) <= REMINDER_WORK_MIN ? WHY.reminder : WHY.SPE;
    default:
      return WHY[s.type];
  }
}
