import { fileURLToPath } from 'node:url';

export const buildRoot = fileURLToPath(new URL('../../dist', import.meta.url));
export const fixturesRoot = fileURLToPath(new URL('../fixtures', import.meta.url));
export const outputRoot = fileURLToPath(new URL('../../.local/tests', import.meta.url));
