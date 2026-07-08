import { makeConfig } from './wdio.shared.js';
const base = makeConfig({ suiteName: 'fullshift-sync', specs: ['../desktop/specs/fullshift-sync.e2e.js'] });
base.mochaOpts = { ...base.mochaOpts, timeout: 600000 };
export const config = base;
