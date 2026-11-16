/** Errors the API turns into a status and a French message that says what to do. */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}

export class InvalidInputError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class ReadOnlyError extends AppError {
  constructor(message: string) {
    super(403, message);
  }
}

export class UndoConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super(401, "Connexion requise : ouvre un nouveau lien de connexion.");
  }
}

export class InvalidLoginLinkError extends AppError {
  constructor() {
    super(401, "Ce lien de connexion n'est plus valable : demande un nouveau lien.");
  }
}

export class TooManyAttemptsError extends AppError {
  constructor() {
    super(429, "Trop d'essais de connexion : réessaie dans 15 minutes.");
  }
}

export class TimetableError extends AppError {
  constructor(message: string) {
    super(502, message);
  }
}

export class TimetableNotConfiguredError extends AppError {
  constructor() {
    super(503, "Aucun lien d'emploi du temps n'est configuré : ajoute ICS_URL aux variables du serveur.");
  }
}
