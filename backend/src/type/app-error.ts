import { STATUS_CODES } from "http";

export class AppError extends Error {
public status: number;

  constructor(message?: string, status = 500) {
    super(message || STATUS_CODES[status]);
    this.status = status;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, this.constructor);
  }
}