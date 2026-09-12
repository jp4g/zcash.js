import type { ZcashError } from '../../docs/api/public-api.js';

// Only qualified adapters record wire status; arbitrary custom exceptions are not absence.
const notFound = new WeakSet<object>();
export function recordNotFound(error: ZcashError): ZcashError { notFound.add(error); return error; }
export function isGrpcNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && notFound.has(error);
}
