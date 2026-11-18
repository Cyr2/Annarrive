import { z } from "zod";

export * from "./api.ts";
export * from "./auth.ts";
export * from "./chat.ts";

export const healthSchema = z.object({ status: z.literal("ok"), version: z.string() });
export type Health = z.infer<typeof healthSchema>;
export * from "./garmin.ts";
export * from "./incident.ts";
export * from "./pace.ts";
export * from "./steps.ts";
