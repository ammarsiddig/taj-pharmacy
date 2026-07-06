import { makeConfig } from './wdio.shared.js';

const base = makeConfig({
  suiteName: 'screenshots',
  specs: ['../desktop/specs/screenshots.e2e.js'],
});
base.mochaOpts = { ...base.mochaOpts, timeout: 600000 };
export const config = base;
