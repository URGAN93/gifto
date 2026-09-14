import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { androidEnvironment } from './android-environment.mjs';
const { env } = androidEnvironment();
const adb = env.ANDROID_HOME ? path.join(env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
const result = spawnSync(adb, ['devices', '-l'], { env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
