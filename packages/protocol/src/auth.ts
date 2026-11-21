import { z } from "zod";

// WebAuthn's JSON forms (https://w3c.github.io/webauthn/#sctn-parseCreationOptionsFromJSON), only the fields the app uses.
const base64url = z
  .string()
  .regex(/^[\w-]*={0,2}$/, "Encodage base64url attendu")
  .max(16_384);
const transportsSchema = z.array(z.enum(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]));
const attachmentSchema = z.enum(["platform", "cross-platform"]);
const userVerificationSchema = z.enum(["required", "preferred", "discouraged"]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{1,40}$/, "Identifiant : lettres, chiffres, point ou tiret");

export const passwordLoginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Écris ton mot de passe").max(200),
});
export type PasswordLogin = z.infer<typeof passwordLoginSchema>;

const credentialFields = {
  id: base64url.min(1),
  rawId: base64url.min(1),
  type: z.literal("public-key"),
  authenticatorAttachment: attachmentSchema.optional(),
  // The app asks for no extension, so none of their outputs is kept.
  clientExtensionResults: z.object({}),
};

export const registrationResponseSchema = z.object({
  ...credentialFields,
  response: z.object({
    clientDataJSON: base64url,
    attestationObject: base64url,
    authenticatorData: base64url.optional(),
    transports: transportsSchema.optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64url.optional(),
  }),
});

export const authenticationResponseSchema = z.object({
  ...credentialFields,
  response: z.object({
    clientDataJSON: base64url,
    authenticatorData: base64url,
    signature: base64url,
    userHandle: base64url.optional(),
  }),
});

const descriptorSchema = z.object({
  id: base64url,
  type: z.literal("public-key"),
  transports: transportsSchema.optional(),
});

export const requestOptionsSchema = z.object({
  challenge: base64url,
  timeout: z.number().optional(),
  rpId: z.string().optional(),
  allowCredentials: z.array(descriptorSchema).optional(),
  userVerification: userVerificationSchema.optional(),
});

export const creationOptionsSchema = z.object({
  rp: z.object({ id: z.string().optional(), name: z.string() }),
  user: z.object({ id: base64url, name: z.string(), displayName: z.string() }),
  challenge: base64url,
  pubKeyCredParams: z.array(z.object({ alg: z.number().int(), type: z.literal("public-key") })),
  timeout: z.number().optional(),
  excludeCredentials: z.array(descriptorSchema).optional(),
  authenticatorSelection: z
    .object({
      authenticatorAttachment: attachmentSchema.optional(),
      residentKey: z.enum(["discouraged", "preferred", "required"]).optional(),
      requireResidentKey: z.boolean().optional(),
      userVerification: userVerificationSchema.optional(),
    })
    .optional(),
  attestation: z.enum(["direct", "enterprise", "indirect", "none"]).optional(),
});

/** GET /api/session: what the signed-in account holds, so Réglages can tell if Face ID is already on. */
export const sessionInfoSchema = z.object({ hasPasskey: z.boolean() });
export type SessionInfo = z.infer<typeof sessionInfoSchema>;
