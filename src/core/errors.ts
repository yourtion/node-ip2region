export type ErrorCode =
  | "INVALID_IP"
  | "INVALID_ARGUMENT"
  | "UNSUPPORTED_FAMILY"
  | "UNSUPPORTED_LANGUAGE"
  | "INVALID_DATABASE"
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "IO_ERROR"
  | "CLOSED"
  | "CONTRACT_ERROR"
  | "ADAPTER_ERROR";

// Preserve stable errors across the ESM/CJS builds and duplicate installations.
const errorMarker = Symbol.for("ip2region.error.v1");

export class IP2RegionError extends Error {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, string | number>>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: unknown; details?: Record<string, string | number> }
  ) {
    super(message, options);
    this.name = "IP2RegionError";
    this.code = code;
    this.details = options?.details;
    Object.defineProperty(this, errorMarker, { value: true });
  }
}

export function adapterError(cause: unknown): IP2RegionError {
  return cause instanceof IP2RegionError ||
    (typeof cause === "object" && cause !== null && Reflect.get(cause, errorMarker) === true)
    ? (cause as IP2RegionError)
    : new IP2RegionError("ADAPTER_ERROR", "The adapter failed", { cause });
}
