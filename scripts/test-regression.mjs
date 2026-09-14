import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let failed = 0;
for (const file of readdirSync('work').filter(name => /^verify-.*\.cjs$/.test(name)).sort()) {
  const result = spawnSync(process.execPath, [`work/${file}`], { encoding: 'utf8' });
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${file}`);
  if (result.status !== 0) { failed++; console.error(result.stdout, result.stderr); }
}
process.exitCode = failed ? 1 : 0;
