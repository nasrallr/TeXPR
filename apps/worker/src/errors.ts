import type { WorkerError, WorkerErrorCode } from "@texpr/shared";

const STATUS: Record<WorkerErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  too_large: 413,
  unsupported: 422,
  compile_failed: 422,
  busy: 503,
  timeout: 504,
  internal: 500,
};

export class JobError extends Error {
  constructor(
    readonly code: WorkerErrorCode,
    message: string,
    readonly log?: string,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }

  toJSON(): WorkerError {
    return { error: this.code, message: this.message, log: this.log };
  }
}
