// Feasibility spike: launch the installed exe and read one known element.
import { makeConfig } from './wdio.shared.js';

export const config = makeConfig({
  suiteName: 'spike',
  specs: ['../desktop/specs/spike.e2e.js'],
});
