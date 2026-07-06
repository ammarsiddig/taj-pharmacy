// Non-destructive safety backup of the desktop SQLite database.
//
// Policy: a fresh backup is taken BEFORE every desktop run. Because the runner
// requires the app to be closed first (WebDriver launches its own instance),
// the .db / .db-wal / .db-shm files are quiescent on disk at backup time, so a
// plain file copy is a consistent snapshot. Restore is NEVER automatic — it is
// an explicit operator action (`node desktop/helpers/db-backup.js restore <dir>`).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DB_SIDECARS, BACKUP_DIR, DB_FILE } from '../../config/env.js';

export function createBackup() {
  if (!fs.existsSync(DB_FILE)) {
    throw new Error(`Cannot back up: desktop DB missing at ${DB_FILE}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `backup-${stamp}`);
  fs.mkdirSync(dest, { recursive: true });

  const copied = [];
  for (const src of DB_SIDECARS) {
    if (fs.existsSync(src)) {
      const to = path.join(dest, path.basename(src));
      fs.copyFileSync(src, to);
      copied.push(path.basename(src));
    }
  }
  // Write a manifest so restore is unambiguous and auditable.
  const manifest = {
    createdAt: new Date().toISOString(),
    source: path.dirname(DB_FILE),
    files: copied,
  };
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`[backup] ${copied.length} file(s) → ${dest}`);
  return dest;
}

export function restoreBackup(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No manifest.json in ${dir} — refusing to restore.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const target = path.dirname(DB_FILE);
  for (const name of manifest.files) {
    fs.copyFileSync(path.join(dir, name), path.join(target, name));
  }
  console.log(`[restore] ${manifest.files.length} file(s) → ${target}`);
}

// CLI: node db-backup.js [backup|restore <dir>]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , cmd, arg] = process.argv;
  if (cmd === 'restore') {
    if (!arg) { console.error('Usage: db-backup.js restore <backup-dir>'); process.exit(1); }
    restoreBackup(arg);
  } else {
    createBackup();
  }
}
