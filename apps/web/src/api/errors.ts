/** A failed call, with a French message that says what to do. Kept apart from the HTTP client so it loads with the first screen. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const OFFLINE = "Pas de connexion au serveur : vérifie ton réseau, puis réessaie.";

export const FAILED = "Ça n'a pas marché. Réessaie dans un instant.";

/** The message to show for any error: the server's own words when it gave some. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FAILED;
}
