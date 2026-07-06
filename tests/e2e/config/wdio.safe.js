import { makeConfig } from './wdio.shared.js';

export const config = makeConfig({
  suiteName: 'safe',
  specs: ['../desktop/specs/safe.e2e.js'],
});
