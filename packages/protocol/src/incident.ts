import { z } from "zod";

/**
 * The incident journal (architecture.md, « Journal des incidents »): what broke on Anna's phone or on the server,
 * with her last gestures, so it can be fixed without asking her.
 */
export const breadcrumbSchema = z.object({
  at: z.string().max(40),
  kind: z.enum(["route", "tap", "sheet", "api", "app"]),
  label: z.string().max(200),
});
export type Breadcrumb = z.infer<typeof breadcrumbSchema>;

export const deviceSchema = z.object({
  userAgent: z.string().max(400),
  viewport: z.string().max(20),
  standalone: z.boolean(),
  os: z.enum(["ios", "android", "other"]),
  /** The built entry file (`index-<hash>.js`): it names the build, so a stack can be mapped back to its sources. */
  version: z.string().max(100),
  timezone: z.string().max(60),
  online: z.boolean(),
});
export type Device = z.infer<typeof deviceSchema>;

export const clientIncidentTypes = ["error", "rejection", "render", "chunk", "api", "slow", "report"] as const;

export const incidentInputSchema = z.object({
  type: z.enum(clientIncidentTypes),
  message: z.string().max(1000),
  stack: z.string().max(8000).optional(),
  at: z.string().max(40),
  route: z.string().max(200),
  breadcrumbs: z.array(breadcrumbSchema).max(50),
  device: deviceSchema,
});
export type IncidentInput = z.infer<typeof incidentInputSchema>;

export const incidentBatchSchema = z.object({ incidents: z.array(incidentInputSchema).min(1).max(5) });

/**
 * Strips what could be a secret before it is kept: query strings (login tokens ride there), e-mail addresses,
 * bearer tokens and JWTs, and any long opaque run of characters (session ids, keys).
 */
export const redact = (text: string): string =>
  text
    .replace(/\?[\w%.~+-]+=[^\s"'()<>]*/g, "?…")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[secret]")
    .replace(/[\w-]{40,}/g, "[secret]");
