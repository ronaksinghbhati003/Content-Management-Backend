import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HttpException } from '../shared/http-exception';
import { ApiResponse } from '../shared/api-response';
import { HttpStatus } from '../shared/constants';
import logger from '../config/logger';

/**
 * Global error-handling middleware.
 * Catches all errors thrown in route handlers and middleware,
 * logs them, and returns a consistent ApiResponse.
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
    // ── Zod Validation Error ──────────────────────────────────────────────
    if (err instanceof z.ZodError) {
        const formattedErrors = err.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));

        logger.warn('Validation error', { errors: formattedErrors });

        res.status(HttpStatus.BAD_REQUEST).json(
            ApiResponse.error(HttpStatus.BAD_REQUEST, 'Validation failed', formattedErrors)
        );
        return;
    }

    // ── JSON Syntax Error ────────────────────────────────────────────────
    if (err instanceof SyntaxError && 'body' in err) {
        logger.warn('JSON parsing error', { message: err.message });

        res.status(HttpStatus.BAD_REQUEST).json(
            ApiResponse.error(HttpStatus.BAD_REQUEST, `Invalid JSON payload: ${err.message}`)
        );
        return;
    }

  // ── Known HttpException ───────────────────────────────────────────────
  if (err instanceof HttpException) {
    if (err.isOperational) {
      logger.warn(err.message, {
        statusCode: err.statusCode,
        errors: err.errors,
      });
    } else {
      logger.error(err.message, {
        statusCode: err.statusCode,
        stack: err.stack,
      });
    }

    res.status(err.statusCode).json(
      ApiResponse.error(
        err.statusCode,
        err.message,
        err.errors.length > 0 ? err.errors : null
      )
    );
    return;
  }

  // ── Unknown / Unexpected Error ────────────────────────────────────────
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
  });

  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
    ApiResponse.error(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred'
    )
  );
};
