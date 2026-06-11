import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler and catches any rejected promises,
 * forwarding them to Express's error-handling middleware via next().
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
