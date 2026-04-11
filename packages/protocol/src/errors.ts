export type BridgeErrorCode =
  | "AuthenticationFailed"
  | "AmbiguousSession"
  | "BridgeUnavailable"
  | "CellNotFound"
  | "ExecutionNotFound"
  | "ExecutionFailed"
  | "ExecutionTimedOut"
  | "InvalidRequest"
  | "KernelSelectionFailed"
  | "KernelUnavailable"
  | "NotebookBusy"
  | "NotebookChanged"
  | "NotebookNotFound"
  | "NotebookNotOpen"
  | "PermissionDenied"
  | "UnsupportedEnvironment"
  | "UnsupportedNotebookType";

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  detail?: unknown;
  recoverable?: boolean;
}

export class BridgeErrorException extends Error implements BridgeError {
  public readonly code: BridgeErrorCode;
  public readonly detail?: unknown;
  public readonly recoverable?: boolean;

  public constructor(error: BridgeError) {
    super(error.message);
    this.name = "BridgeErrorException";
    this.code = error.code;
    this.detail = error.detail;
    this.recoverable = error.recoverable;
  }

  public toJSON(): BridgeError {
    return {
      code: this.code,
      message: this.message,
      detail: this.detail,
      recoverable: this.recoverable,
    };
  }
}

export function asBridgeError(error: unknown): BridgeError {
  if (error instanceof BridgeErrorException) {
    return error.toJSON();
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return {
      code: (error as { code: BridgeErrorCode }).code,
      message: (error as { message: string }).message,
      detail: (error as { detail?: unknown }).detail,
      recoverable: (error as { recoverable?: boolean }).recoverable,
    };
  }

  if (error instanceof Error) {
    return {
      code: "BridgeUnavailable",
      message: error.message,
    };
  }

  return {
    code: "BridgeUnavailable",
    message: "Unknown error",
    detail: error,
  };
}

export function fail(error: BridgeError): never {
  throw new BridgeErrorException(error);
}
