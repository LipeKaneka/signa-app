/**
 * Erro com status HTTP. Services lançam (com as fábricas abaixo) e o errorHandler responde {error}.
 * @property {number} status
 * Fábricas: badRequest (400), unauthorized (401), forbidden (403), notFound (404), conflict (409).
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const unauthorized = (message = "Faça login para continuar.") => new HttpError(401, message);
export const forbidden = (message = "Você não tem permissão para isso.") => new HttpError(403, message);
export const notFound = (message = "Não encontrado.") => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);
