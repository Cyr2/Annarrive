import {
  type ChangeResponse,
  type ChatWidget,
  changeOptionSchema,
  createEventInputSchema,
  goalSchema,
  isoWeekSchema,
  localDateSchema,
  localDateTimeSchema,
  type Profile,
  paceLabel,
  painSiteSchema,
  profilePatchSchema,
  programInputSchema,
  sessionAskSchema,
  unavailableSchema,
  updateEventInputSchema,
} from "@annarrive/protocol";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { ZodError, z } from "zod";
import { AppError } from "../errors.ts";
import type { FitnessService } from "../services/fitness.ts";
import type { PlanService } from "../services/plan.ts";
import { frenchDay, isoWeekOf } from "../time.ts";

export const MCP_SERVER = "annarrive";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const paceSchema = z.tuple([z.number(), z.number()]);
const datedSchema = z.union([z.object({ start: localDateTimeSchema }), z.object({ date: localDateSchema })]);

/**
 * Written as Anna reads them, so the model copies instead of computing: paces as « 6'00 /km », and every session,
 * event, slot or day with its `day` in words (« demain, mardi 17 »).
 */
function forReggie(today: string) {
  return (key: string, value: unknown): unknown => {
    const pace = key === "paceSKm" ? paceSchema.safeParse(value) : undefined;
    if (pace?.success) return paceLabel(pace.data);
    if (typeof value !== "object" || value === null || Array.isArray(value) || "day" in value) return value;
    const dated = datedSchema.safeParse(value);
    if (!dated.success) return value;
    const date = "start" in dated.data ? dated.data.start.slice(0, 10) : dated.data.date;
    return { ...value, day: frenchDay(date, today) };
  };
}

/** Every tool answers JSON; a refusal from the services comes back as an error the model must relay. */
async function answer(work: () => unknown, today: string): Promise<ToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(work() ?? { ok: true }, forReggie(today)) }] };
  } catch (error) {
    if (!(error instanceof AppError || error instanceof ZodError)) throw error;
    const message = error instanceof ZodError ? (error.issues[0]?.message ?? "Donnée invalide") : error.message;
    return { content: [{ type: "text", text: JSON.stringify({ ok: false, refused: message }) }], isError: true };
  }
}

const settingPatch = profilePatchSchema.strict();

/**
 * The app's actions as tools: reads, the Déplacer / Changer / Pas dispo flows and settings, all through `PlanService`
 * (hence `CoachPort` and the change log). Widgets they produce land in `widgets`, shown under Reggie's reply.
 */
/** The timetable link is a secret (anyone holding it reads her week): it never goes to the model. */
const withoutLink = ({ icsUrl: _, ...settings }: Profile) => settings;

export function reggieTools(plan: PlanService, fitness: FitnessService, widgets: ChatWidget[]) {
  const run = (work: () => unknown) => answer(work, plan.todayDate());
  const changed = (response: ChangeResponse) => {
    const { change, warnings } = response;
    if (change) widgets.push({ type: "change", changeId: change.id, summary: change.summary, warnings });
    return { ok: true, ...response };
  };
  const show = (widget: ChatWidget) => {
    widgets.push(widget);
    return { shown: true };
  };
  const sessionId = z.string().min(1).describe("Identifiant de la séance, lu avec get_today ou get_week");

  return [
    tool("get_today", "Séance du jour et emploi du temps d'aujourd'hui.", {}, () => run(() => plan.today())),
    tool(
      "get_week",
      "Séances et événements d'une semaine ISO (par défaut la semaine en cours).",
      { week: isoWeekSchema.optional().describe("Semaine ISO, par exemple 2026-W47") },
      ({ week }) => run(() => plan.week(week ?? isoWeekOf(plan.today().date))),
    ),
    tool(
      "get_program",
      "Objectif et plan (phases ; verdict sur sa cible et ses raisons : temps prédit aujourd'hui, semaines, gain demandé et gain habituel), réglages (jours sans course, horaires, coucher) et santé.",
      {},
      () => run(() => ({ program: plan.programView(), settings: withoutLink(plan.profile()), health: plan.health() })),
    ),
    tool("get_recent", "Statut santé, sommeil, FC de repos et courses des 14 derniers jours.", {}, () =>
      run(() => plan.recent()),
    ),
    tool(
      "propose_move_slots",
      "Déplacer, étape 1 : les meilleurs créneaux pour une séance, avec les créneaux interdits et leur raison. Montre les créneaux à Anna.",
      { sessionId },
      ({ sessionId }) =>
        run(() => {
          const slots = plan.proposeMoveSlots(sessionId);
          if (slots.best.length > 0) widgets.push({ type: "slots", sessionId, slots: slots.best.slice(0, 3) });
          return slots;
        }),
    ),
    tool(
      "move_session",
      "Déplacer, étape 2 : déplace la séance au créneau qu'Anna a choisi. Le contenu peut être adapté si le créneau casse une règle. Une séance à venir marquée sautée revient au plan ainsi.",
      { sessionId, start: localDateTimeSchema.describe("Début, heure de Paris, AAAA-MM-JJTHH:MM") },
      ({ sessionId, start }) => run(() => changed(plan.moveSession(sessionId, start))),
    ),
    tool(
      "change_options",
      "Changer, étape 1 : les options plus court, plus facile, équivalente et footing tranquille. Montre-les à Anna.",
      { sessionId },
      ({ sessionId }) =>
        run(() => {
          const options = plan.changeOptions(sessionId);
          for (const option of changeOptionSchema.options) {
            const session = options[option];
            if (session) widgets.push({ type: "session_preview", sessionId, option, session });
          }
          return options;
        }),
    ),
    tool(
      "change_session",
      "Changer, étape 2 : remplace la séance par l'option qu'Anna a choisie.",
      { sessionId, option: changeOptionSchema },
      ({ sessionId, option }) => run(() => changed(plan.changeSession(sessionId, option))),
    ),
    tool(
      "report_unavailable",
      "Pas dispo. no_time : aucun créneau ne va. tired : fatiguée. sick : malade, avec feverOrChest. pain : douleur, avec where et level (0 à 10 en marchant). until : dernier jour, absent pour aujourd'hui seulement.",
      {
        reason: z.enum(["no_time", "tired", "sick", "pain"]),
        feverOrChest: z.boolean().optional(),
        where: painSiteSchema.optional(),
        level: z.number().int().min(0).max(10).optional(),
        until: localDateSchema.optional(),
      },
      ({ level, ...rest }) =>
        run(() => changed(plan.reportUnavailable(unavailableSchema.parse({ ...rest, walking0to10: level })))),
    ),
    tool(
      "feel_better",
      "« Ça va mieux » : lève le statut malade, rhume ou douleur et lance le retour progressif. Seulement sur un oui clair d'Anna.",
      {},
      () => run(() => changed(plan.feelBetter())),
    ),
    tool(
      "update_setting",
      "Modifie un réglage : courses par semaine, jours sans course (1 lundi à 7 dimanche), pas avant, fin au plus tard, coucher, jour de sortie longue, heure préférée (null : l'heure habituelle), sommeil et FC, temps entre une course et un cours (travelMin, en min).",
      { patch: settingPatch },
      ({ patch }) => run(() => changed(plan.updateProfile(patch))),
    ),
    tool(
      "request_session",
      "Séance à la demande : Anna demande une séance précise. type E footing, RECUP récupération, SPRINTS footing avec sprints, L sortie longue, T seuil, CRUISE seuil en fractions, I fractionné, R vitesse, SPE allure objectif, FARTLEK. days : jours acceptés (AAAA-MM-JJ, lus avec get_week ; absent : de demain à dimanche). replace : id de la séance à remplacer, \"add\" pour une course en plus. L'algorithme accepte, ajuste ou refuse avec sa raison et une alternative. apply false : montre la proposition ; apply true : l'enregistre, Annuler reste possible.",
      { ...sessionAskSchema.shape, apply: z.boolean() },
      ({ apply, ...ask }) =>
        run(() => {
          const answer = plan.requestSession(sessionAskSchema.parse(ask), apply);
          if (answer.accepted && answer.change)
            widgets.push({
              type: "change",
              changeId: answer.change.id,
              summary: answer.change.summary,
              warnings: answer.warnings ?? [],
            });
          else if (answer.accepted) widgets.push({ type: "session_request", session: answer.session });
          else if (answer.alternative) widgets.push({ type: "session_request", session: answer.alternative.session });
          return answer;
        }),
    ),
    tool(
      "add_event",
      "Ajouter : un créneau Occupée (unavailable), une muscu (strength, legs true si elle travaille les jambes), une révision, ou son travail (work, legs true pour un travail physique ; un appel par jour de travail). recurrence none, weekly ou biweekly. Les courses en conflit bougent.",
      createEventInputSchema.shape,
      (input) => run(() => changed(plan.createEvent(createEventInputSchema.parse(input)))),
    ),
    tool(
      "edit_event",
      "Modifier un événement qu'Anna a ajouté (muscu, révision, Occupée) : horaires, titre, jambes. id lu avec get_week.",
      { id: z.string().min(1), patch: updateEventInputSchema },
      ({ id, patch }) => run(() => changed(plan.updateEvent(id, updateEventInputSchema.parse(patch)))),
    ),
    tool(
      "cancel_class",
      "« Ce cours n'a pas lieu » : libère le créneau d'un cours. restore true : « Le cours a lieu finalement ». id lu avec get_week.",
      { id: z.string().min(1), restore: z.boolean().optional() },
      ({ id, restore }) => run(() => changed(restore ? plan.restoreClass(id) : plan.cancelClass(id))),
    ),
    tool(
      "change_goal",
      "Modifier l'objectif comme la feuille Objectif de Programme : distance (5000, 10000, 21097.5, 42195), date, chrono visé en minutes (targetMin), heure de départ. goal null : plus d'objectif, mode entretien. Seulement sur une demande claire d'Anna.",
      { goal: goalSchema.nullable() },
      ({ goal }) => run(() => changed(plan.updateProgram(programInputSchema.parse({ goal })))),
    ),
    tool(
      "explain_session",
      "Une course qu'Anna explique (repas trop proche, règles, nuit courte, chaleur, stress, rhume qui arrive...). set_aside : cette course ne compte dans aucune lecture de son niveau ni de ses allures. keep : elle compte. Ne change jamais un niveau ni une allure. Courses des 7 derniers jours, deux mises de côté en 14 jours au plus.",
      {
        runId: z.string().min(1).describe("Identifiant de la course, lu avec get_recent"),
        summary: z
          .string()
          .min(1)
          .max(200)
          .describe("Ton résumé de son explication, en quelques mots, jamais ses propres mots"),
        decision: z.enum(["set_aside", "keep"]),
      },
      ({ runId, summary, decision }) =>
        run(() => (decision === "keep" ? { ok: true, kept: true } : changed(fitness.setAside(runId, summary)))),
    ),
    tool(
      "ask_choice",
      "Affiche 2 à 5 boutons de réponse sous ton message, pour une question fermée.",
      { options: z.array(z.string().min(1).max(40)).min(2).max(5) },
      ({ options }) => run(() => show({ type: "choices", options })),
    ),
    tool(
      "ask_level",
      "Affiche un curseur de 0 à 10 sous ton message, pour un niveau de douleur ou de fatigue.",
      { label: z.string().min(1).max(60) },
      ({ label }) => run(() => show({ type: "slider", label, min: 0, max: 10 })),
    ),
  ];
}

export type ReggieTool = ReturnType<typeof reggieTools>[number];
