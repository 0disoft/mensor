export class ReferenceRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceRuntimeConfigurationError";
  }
}

export class RequestFailure extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestFailure";
    this.status = status;
  }
}
