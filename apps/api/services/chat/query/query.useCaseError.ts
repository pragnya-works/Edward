import { HttpStatus } from "../../../utils/constants.js";

export class QueryUseCaseError extends Error {
  readonly status: HttpStatus;
  readonly code: string;

  constructor(params: { status: HttpStatus; message: string; code: string }) {
    super(params.message);
    this.name = "QueryUseCaseError";
    this.status = params.status;
    this.code = params.code;
  }
}

export function isQueryUseCaseError(error: unknown): error is QueryUseCaseError {
  return error instanceof QueryUseCaseError;
}
