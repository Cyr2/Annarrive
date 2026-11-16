import { z } from "zod";

// Mirrors apps/garmin-bridge: every Garmin field may be missing, the vivoactive 4 lacks several.
const optionalNumber = z.number().nullable();

export const garminActivitySchema = z.object({
  id: z.number().int(),
  type: z.string().nullable(),
  startTimeLocal: z.string().nullable(),
  startTimeGmt: z.string().nullable(),
  durationS: optionalNumber,
  distanceM: optionalNumber,
  avgSpeedMps: optionalNumber,
  avgPaceSPerKm: optionalNumber,
  avgHr: optionalNumber,
  maxHr: optionalNumber,
  elevationGainM: optionalNumber,
  feel: optionalNumber,
  rpe: optionalNumber,
});
export type GarminActivity = z.infer<typeof garminActivitySchema>;

export const garminLapSchema = z.object({
  durationS: optionalNumber,
  distanceM: optionalNumber,
  avgSpeedMps: optionalNumber,
  avgHr: optionalNumber,
});
export type GarminLap = z.infer<typeof garminLapSchema>;

export const garminDailySignalsSchema = z.object({
  date: z.iso.date(),
  sleepS: optionalNumber,
  sleepScore: optionalNumber,
  restingHr: optionalNumber,
  stressAvg: optionalNumber,
  bodyBatteryAtWake: optionalNumber,
  bodyBatteryHighest: optionalNumber,
  vo2Max: optionalNumber,
});
export type GarminDailySignals = z.infer<typeof garminDailySignalsSchema>;

/** Speeds in m/s; the slow end is Garmin's lower bound. */
export const paceRangeSchema = z
  .object({ slowMps: z.number().positive(), fastMps: z.number().positive() })
  .refine((pace) => pace.slowMps <= pace.fastMps, "slowMps doit être inférieure ou égale à fastMps");

export const workoutStepSchema = z
  .object({
    kind: z.enum(["warmup", "interval", "recovery", "cooldown"]),
    durationS: z.number().positive().optional(),
    distanceM: z.number().positive().optional(),
    pace: paceRangeSchema.optional(),
  })
  .refine(
    (step) => (step.durationS === undefined) !== (step.distanceM === undefined),
    "Une étape se termine soit au temps, soit à la distance",
  );
export type WorkoutStep = z.infer<typeof workoutStepSchema>;

export const workoutRepeatSchema = z.object({
  kind: z.literal("repeat"),
  iterations: z.number().int().min(1).max(99),
  steps: z.array(workoutStepSchema).min(1),
});

export const workoutRequestSchema = z.object({
  name: z.string().min(1).max(80),
  date: z.iso.date(),
  description: z.string().max(500).optional(),
  steps: z.array(z.union([workoutStepSchema, workoutRepeatSchema])).min(1),
});
export type WorkoutRequest = z.infer<typeof workoutRequestSchema>;

export const createdWorkoutSchema = z.object({ workoutId: z.number().int() });
export type CreatedWorkout = z.infer<typeof createdWorkoutSchema>;
