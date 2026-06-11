import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Validation targets in the request object.
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Factory middleware that validates a specific part of the request
 * against a Zod schema. On failure, the ZodError is forwarded to
 * the global error handler via next().
 *
 * @example
 * router.post('/users', validate(createUserSchema), controller.create);
 * router.get('/users', validate(listQuerySchema, 'query'), controller.list);
 */
export const validate = (
  schema: z.ZodType,
  target: ValidationTarget = 'body'
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Replace with parsed (and potentially transformed) data
    req[target] = result.data;
    next();
  };
};
