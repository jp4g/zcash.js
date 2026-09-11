import { mkdtempSync } from 'node:fs';
import { suite } from './suite.mjs';
import { start } from './node-harness.mjs';
await suite({ root: () => mkdtempSync('/home/jack/zcash-storage-scratch/suite-'), start }, r => console.log(JSON.stringify(r)));
