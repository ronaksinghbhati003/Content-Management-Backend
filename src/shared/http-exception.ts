import { HttpStatus } from './constants';

/**
 * Base HTTP Exception for structured error handling.
 * Extends the native Error class with status codes and optional error details.
 */
export class HttpException extends Error {
  public readonly statusCode: number;
  public readonly errors: unknown[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    errors: unknown[] = [],
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Convenience Subclasses ─────────────────────────────────────────────────

export class BadRequestException extends HttpException {
  constructor(message = 'Bad request', errors: unknown[] = []) {
    super(HttpStatus.BAD_REQUEST, message, errors);
  }
}

export class AlreadyExistsException extends HttpException {
  constructor(message = 'Already Exists') {
    super(HttpStatus.CONFLICT, message);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized') {
    super(HttpStatus.UNAUTHORIZED, message);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden') {
    super(HttpStatus.FORBIDDEN, message);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Resource not found') {
    super(HttpStatus.NOT_FOUND, message);
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict') {
    super(HttpStatus.CONFLICT, message);
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message = 'Unprocessable entity', errors: unknown[] = []) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, message, errors);
  }
}

export class InternalServerException extends HttpException {
  constructor(message = 'Internal server error') {
    super(HttpStatus.INTERNAL_SERVER_ERROR, message, [], false);
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests') {
    super(HttpStatus.TOO_MANY_REQUESTS, message);
  }
}
