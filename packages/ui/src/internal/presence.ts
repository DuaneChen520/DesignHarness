import type { ReactNode } from 'react';

/**
 * Returns true if the provided ReactNode is present (not undefined, null, false, or empty string).
 */
export const isPresent = (value: ReactNode): boolean =>
  value !== undefined && value !== null && value !== false && value !== '';
