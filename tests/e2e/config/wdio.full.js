import { makeConfig } from './wdio.shared.js';

const base = makeConfig({
  suiteName: 'full',
  specs: ['../desktop/specs/full.e2e.js'],
});
// The day-in-the-life scenario is one long ordered test — give it room.
base.mochaOpts = { ...base.mochaOpts, timeout: 900000 };
export const config = base;
