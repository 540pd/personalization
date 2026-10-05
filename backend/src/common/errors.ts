import type { ErrorRequestHandler, Response } from "express";

export interface ApiErrorResponse {
  error: string;
  message: string;
}

export function sendValidationError(res: Response, message: string): void {
  res.status(400).json({ error: "validation_error", message } satisfies ApiErrorResponse);
}

export const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  console.error(
    `[error] ${req.method} ${req.path}`,
    err instanceof Error ? err : new Error(String(err))
  );
  res.status(500).json({
    error: "internal_error",
    message: "An unexpected error occurred.",
  } satisfies ApiErrorResponse);
};
