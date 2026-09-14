import { spawnSync } from 'node:child_process';
import { androidEnvironment } from './android-environment.mjs';
const { env, cwd } = androidEnvironment();
const result = spawnSync(process.platform === 'win32' ? 'cmd.exe' : './gradlew',
  process.platform === 'win32' ? ['/d', '/c', 'gradlew.bat assembleDebug --console=plain'] : ['assembleDebug', '--console=plain'],
  { cwd, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
