#!/usr/bin/env node
// Consolidate real API keys from the OneDrive-plaintext API-KEY-SETUP.md into
// the gitignored .env — file→file, so no value ever transits chat or a CLI arg.
// Idempotent: never overwrites an existing .env key; only appends missing ones.
// Prints ONLY booleans/status, never a secret value. Run:  node scripts/agents/sync-env-from-setup.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SETUP = path.join(ROOT, 'API-KEY-SETUP.md');
const ENV = path.join(ROOT, '.env');
const WANT = ['BLS_API_KEY', 'CENSUS_API_KEY', 'FRED_API_KEY', 'HUD_API_TOKEN', 'WALKSCORE_API_KEY'];
const DASH = 'https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api';

const placeholderish = (v) =>
  !v || v.length < 8 || /^your_/i.test(v) || /[<>]/.test(v) || /[^\x20-\x7e]/.test(v);

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

const setupText = fs.existsSync(SETUP) ? fs.readFileSync(SETUP, 'utf8') : '';
const envText = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
const setup = parseEnv(setupText);
const env = parseEnv(envText);

let appended = '';
for (const key of WANT) {
  if (!env.has(key) || placeholderish(env.get(key))) {
    const val = setup.get(key);
    if (val && !placeholderish(val)) {
      appended += `${key}=${val}\n`;
      console.log(`${key}: added`);
    } else {
      console.log(`${key}: not-found (fill it in .env yourself; free signup in API-KEY-SETUP.md)`);
    }
  } else {
    console.log(`${key}: already-present`);
  }
}
if (appended) {
  const sep = envText.endsWith('\n') || envText === '' ? '' : '\n';
  fs.appendFileSync(ENV, `${sep}# Enricher API keys (consolidated from API-KEY-SETUP.md)\n${appended}`);
}

const srk = env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!srk || placeholderish(srk)) {
  console.log(`\nSUPABASE_SERVICE_ROLE_KEY: MISSING — paste it into .env yourself, from:\n  ${DASH}`);
  process.exitCode = 2;
} else {
  console.log('\nSUPABASE_SERVICE_ROLE_KEY: present');
}
console.log('\nDone. Next: scrub the real values out of API-KEY-SETUP.md (replace with placeholders or delete the file — it is only a signup guide).');
