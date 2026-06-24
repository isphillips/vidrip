#!/usr/bin/env node
/*
 * Structural validator for the Maestro E2E flows. Runs in CI with no device and no
 * Maestro install. It does NOT parse YAML (Maestro's `${VAR}` interpolation inside inline
 * `env: { ... }` maps is valid Maestro but trips strict YAML parsers) — it does cheap,
 * high-signal structural checks instead:
 *   1. every flow declares `appId: ${APP_ID}`
 *   2. every flow has a `---` separator and at least one `- ` command after it
 *   3. every `runFlow:`/`file:` reference resolves to a file that exists
 *   4. flows under smoke/ and suites/ declare at least one `tags:` entry
 * Exits non-zero with a list of problems.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // .maestro/
const errors = [];

/** Recursively collect *.yaml files under a dir. */
function yamls(dir) {
  const out = [];
  if (!fs.existsSync(dir)) { return out; }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { out.push(...yamls(p)); }
    else if (entry.name.endsWith('.yaml')) { out.push(p); }
  }
  return out;
}

// config.yaml is a workspace config, not a flow — validate flows + helpers only.
const flowFiles = [
  ...yamls(path.join(ROOT, 'smoke')),
  ...yamls(path.join(ROOT, 'suites')),
];
const helperFiles = yamls(path.join(ROOT, 'helpers'));
const allFlows = [...flowFiles, ...helperFiles];

if (flowFiles.length === 0) {
  errors.push('No flow files found under .maestro/smoke or .maestro/suites');
}

for (const file of allFlows) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');

  if (!/^appId:\s*\$\{APP_ID\}\s*$/m.test(text)) {
    errors.push(`${rel}: missing "appId: \${APP_ID}"`);
  }

  const sepIdx = text.indexOf('\n---');
  if (sepIdx === -1) {
    errors.push(`${rel}: missing "---" frontmatter separator`);
  } else {
    const body = text.slice(sepIdx);
    if (!/^\s*-\s+\S/m.test(body)) {
      errors.push(`${rel}: no commands after "---"`);
    }
  }

  // Flows (not helpers) must carry at least one tag for selective runs.
  if (flowFiles.includes(file) && !/^tags:\s*$/m.test(text)) {
    errors.push(`${rel}: missing "tags:" block`);
  }

  // Every referenced subflow file must exist.
  for (const m of text.matchAll(/\bfile:\s*([^\s#]+)/g)) {
    const refRaw = m[1].replace(/['"]/g, '');
    const resolved = path.resolve(path.dirname(file), refRaw);
    if (!fs.existsSync(resolved)) {
      errors.push(`${rel}: runFlow references missing file "${refRaw}"`);
    }
  }
}

if (errors.length) {
  console.error(`✗ Maestro flow validation failed (${errors.length}):`);
  for (const e of errors) { console.error(`  - ${e}`); }
  process.exit(1);
}
console.log(`✓ Maestro flows valid: ${flowFiles.length} flows + ${helperFiles.length} helpers`);
