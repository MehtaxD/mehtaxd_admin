export type SafeAdminApiError = {
  code: "VALIDATION_FAILED" | "SESSION_EXPIRED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
};

export function safeAdminApiError(
  status: number,
  fallback = "We couldn’t complete this Admin request. Try again.",
): SafeAdminApiError {
  if (status === 400 || status === 413 || status === 415 || status === 422)
    return { code: "VALIDATION_FAILED", message: "Review the submitted information and try again.", retryable: false };
  if (status === 401)
    return { code: "SESSION_EXPIRED", message: "Your Admin session expired. Log in again to continue.", retryable: false };
  if (status === 403)
    return { code: "FORBIDDEN", message: "Your Admin account cannot complete this action.", retryable: false };
  if (status === 404)
    return { code: "NOT_FOUND", message: fallback, retryable: false };
  if (status === 409)
    return { code: "CONFLICT", message: "This record changed while you were working. Refresh it and try again.", retryable: true };
  if (status === 429)
    return { code: "RATE_LIMITED", message: "Too many requests were made. Wait a moment, then try again.", retryable: true };
  if (status >= 500)
    return { code: "SERVICE_UNAVAILABLE", message: "The Admin service is temporarily unavailable. Try again in a moment.", retryable: true };
  return { code: "INTERNAL_ERROR", message: fallback, retryable: false };
}

export function safeAdminErrorFromPayload(
  status: number,
  payload: unknown,
  fallback?: string,
): SafeAdminApiError {
  if (typeof payload === "object" && payload !== null) {
    const code = Reflect.get(payload, "code");
    const message = Reflect.get(payload, "message");
    const retryable = Reflect.get(payload, "retryable");
    if (
      typeof code === "string" &&
      typeof message === "string" &&
      typeof retryable === "boolean" &&
      /^[A-Z][A-Z0-9_]{2,48}$/.test(code)
    ) {
      return { ...safeAdminApiError(status, fallback), message, retryable };
    }
  }
  return safeAdminApiError(status, fallback);
}

