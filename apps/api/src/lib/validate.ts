import type { ZodTypeAny, z } from 'zod';
import { AppError } from './errors';

/** Validate with zod; returns the parsed (output) type so defaults are non-optional. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const details = r.error.issues.map((i) => ({ code: i.code, path: i.path, message: i.message, expected: (i as any).expected }));
    throw new AppError('VAL_001', 'Validation failed', 400, details);
  }
  return r.data;
}
