import { makeConfig } from './wdio.shared.js';

const base = makeConfig({
  suiteName: 'exhaustive',
  specs: ['../desktop/specs/exhaustive.e2e.js'],
});
// One long ordered test covering the whole surface — give it plenty of room.
base.mochaOpts = { ...base.mochaOpts, timeout: 1500000 };
export const config = base;
