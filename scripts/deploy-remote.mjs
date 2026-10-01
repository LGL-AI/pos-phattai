// One-click Cloudflare D1 migration + Worker deploy for PHAT TAI.
// Why: `wrangler d1 migrations apply --remote` can fail on trigger-heavy SQL
// with SQLITE_ERROR 7500. This script sends each migration through D1's
// file-import path and records d1_migrations in the SAME import transaction.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = resolve(root, 'migrations');
const configPath = resolve(root, 'wrangler.jsonc');
const wrangler = resolve(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function fail(message) {
  console.error(`\n[PHATTAI DEPLOY] ERROR: ${message}`);
  // Annotations are readable without signing in; logs are not.
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${message.replace(/\r?\n/g, ' | ').slice(0, 900)}`);
  process.exit(1);
}
function run(args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [wrangler,...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    if (capture) {
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    fail(`wrangler ${args.join(' ')} exited with code ${result.status}`);
  }
  return capture ? `${result.stdout || ''}\n${result.stderr || ''}` : '';
}
function jsonFromWrangler(text) {
  const trimmed = text.trim();
  const starts = [trimmed.indexOf('['), trimmed.indexOf('{')].filter(i => i >= 0).sort((a,b) => a-b);
  for (const start of starts) {
    try { return JSON.parse(trimmed.slice(start)); } catch {}
  }
  fail(`Could not parse Wrangler JSON output:\n${trimmed.slice(0, 1200)}`);
}
function query(sql) {
  const out = run(['d1', 'execute', databaseName, '--remote', '--command', sql, '--json'], { capture: true });
  const data = jsonFromWrangler(out);
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || first.success === false) fail(`D1 query failed: ${sql}`);
  return first.results || first.result?.[0]?.results || [];
}
function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

let config;
try { config = JSON.parse(readFileSync(configPath, 'utf8')); }
catch (error) { fail(`wrangler.jsonc must remain JSON-compatible: ${error.message}`); }
if (config.name !== 'pos-phattai') fail(`Worker name must be pos-phattai, got ${config.name}`);
const db = (config.d1_databases || []).find(x => x.binding === 'DB');
if (!db) fail('Missing D1 binding DB in wrangler.jsonc');
if (db.database_name !== 'pos_phattai') fail(`Refusing to migrate non-PHAT-TAI database: ${db.database_name}`);
const databaseName = db.database_name;
const migrateOnly = process.argv.includes('--migrate-only');

const migrations = readdirSync(migrationDir)
  .filter(name => /^\d+_.+\.sql$/i.test(name))
  .sort((a,b) => a.localeCompare(b, 'en'));
if (!migrations.length) fail('No migration files found.');

console.log(`[PHATTAI DEPLOY] Worker: ${config.name}`);
console.log(`[PHATTAI DEPLOY] D1: ${databaseName} (${db.database_id})`);
console.log(`[PHATTAI DEPLOY] Found ${migrations.length} migration files.`);

// A direct deploy uses the same gates as an APK build.
for(const script of ['sync-android-assets.mjs','verify-release.mjs']){
 const checked=spawnSync(process.execPath,[resolve(root,'scripts',script)],{cwd:root,env:process.env,stdio:'inherit'});
 if(checked.error||checked.status!==0)fail(`Release gate failed: ${script}`);
}
const backupDirectory=resolve(root,'backups');mkdirSync(backupDirectory,{recursive:true});
const backupPath=resolve(backupDirectory,'pos_phattai_'+new Date().toISOString().replace(/[:.]/g,'-')+'.sql');
console.log('[PHATTAI DEPLOY] Exporting a D1 backup before migration...');
run(['d1','export',databaseName,'--remote','--output',backupPath]);
console.log(`[PHATTAI DEPLOY] Backup: ${backupPath}`);

// Match Wrangler's own migrations table schema, but create it through a simple
// command so a brand-new PHAT TAI D1 can also use this one-click path.
run([
  'd1','execute',databaseName,'--remote','--yes','--command',
  `CREATE TABLE IF NOT EXISTS d1_migrations(\n` +
  `id INTEGER PRIMARY KEY AUTOINCREMENT,\n` +
  `name TEXT UNIQUE,\n` +
  `applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\n` +
  `);`
]);

const appliedRows = query('SELECT name FROM d1_migrations ORDER BY id;');
const applied = appliedRows.map(row => row.name);
const expectedPrefix = migrations.slice(0, applied.length);
if (applied.join('\n') !== expectedPrefix.join('\n')) {
  fail(`Migration history is not a clean prefix.\nApplied: ${applied.join(', ')}\nExpected prefix: ${expectedPrefix.join(', ')}`);
}

const pending = migrations.slice(applied.length);
if (pending.length === 0) {
  console.log('[PHATTAI DEPLOY] D1 is already current.');
} else {
  console.log(`[PHATTAI DEPLOY] Pending: ${pending.join(', ')}`);
  const temp = mkdtempSync(join(tmpdir(), 'phattai-d1-'));
  try {
    for (const name of pending) {
      const sourcePath = resolve(migrationDir, name);
      let sql = readFileSync(sourcePath, 'utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
      // Record history in the same /import transaction. If SQL fails, neither
      // schema nor stamp is committed; this avoids an import/stamp split-brain.
      sql = `${sql.trimEnd()}\n\nINSERT INTO d1_migrations(name) VALUES (${sqlQuote(name)});\n`;
      const importPath = resolve(temp, basename(name));
      writeFileSync(importPath, sql, 'utf8');
      console.log(`\n[PHATTAI DEPLOY] Applying ${name} via D1 file import...`);
      run(['d1','execute',databaseName,'--remote',`--file=${importPath}`,'--yes']);
      const after = query('SELECT name FROM d1_migrations ORDER BY id;').map(row => row.name);
      const want = migrations.slice(0, after.length);
      if (after.join('\n') !== want.join('\n') || after.at(-1) !== name) {
        fail(`History verification failed immediately after ${name}.`);
      }
      console.log(`[PHATTAI DEPLOY] ${name} OK`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const finalHistory = query('SELECT name FROM d1_migrations ORDER BY id;').map(row => row.name);
if (finalHistory.join('\n') !== migrations.join('\n')) {
  fail(`D1 is not fully migrated (${finalHistory.length}/${migrations.length}).`);
}
console.log(`[PHATTAI DEPLOY] D1 migrations complete: ${finalHistory.length}/${migrations.length}.`);
if (migrateOnly) {
  console.log('[PHATTAI DEPLOY] Migration-only mode complete.');
} else {
  console.log('[PHATTAI DEPLOY] Deploying Worker...');
  run(['deploy']);
  const verified=spawnSync(process.execPath,[resolve(root,'scripts/post-deploy-verify.mjs')],{cwd:root,env:process.env,stdio:'inherit'});
  if(verified.error||verified.status!==0)fail('Worker deployment returned, but production health/updater verification failed. Do not mark rollout complete.');
  console.log('[PHATTAI DEPLOY] DONE.');
}
