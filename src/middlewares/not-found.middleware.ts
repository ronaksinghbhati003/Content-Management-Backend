import { Request, Response } from 'express';
import { ApiResponse } from '../shared/api-response';
import { HttpStatus } from '../shared/constants';

/**
 * Catch-all middleware for undefined routes.
 * Must be registered after all other routes.
 */
export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(HttpStatus.NOT_FOUND).json(
    ApiResponse.error(
      HttpStatus.NOT_FOUND,
      `Route ${_req.method} ${_req.originalUrl} not found`
    )
  );
};
