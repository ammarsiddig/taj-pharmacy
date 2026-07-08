import { makeConfig } from './wdio.shared.js';

const base = makeConfig({
  suiteName: 'fullshift',
  specs: ['../desktop/specs/fullshift-live.e2e.js'],
});
// The full live shift is one long ordered scenario — give it plenty of room.
base.mochaOpts = { ...base.mochaOpts, timeout: 1_800_000 };
export const config = base;
