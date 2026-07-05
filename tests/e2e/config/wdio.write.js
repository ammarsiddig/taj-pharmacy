import { makeConfig } from './wdio.shared.js';

export const config = makeConfig({
  suiteName: 'write',
  specs: ['../desktop/specs/write.e2e.js'],
});
