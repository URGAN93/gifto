import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { androidEnvironment } from './android-environment.mjs';
const { env, cwd } = androidEnvironment();
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/@capacitor/cli/bin/capacitor', import.meta.url)), 'open', 'android'],
  { cwd: path.dirname(cwd), env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
