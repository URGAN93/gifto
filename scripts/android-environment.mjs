import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export function androidEnvironment() {
  const configFile = path.join(repositoryRoot, '.android-tools.local.json');
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
  const env = { ...process.env };
  for (const [field, name] of Object.entries({ javaHome: 'JAVA_HOME', sdkRoot: 'ANDROID_HOME',
    gradleUserHome: 'GRADLE_USER_HOME', androidUserHome: 'ANDROID_USER_HOME', studioPath: 'CAPACITOR_ANDROID_STUDIO_PATH' })) {
    if (config[field]) {
      if (!path.isAbsolute(config[field])) throw new Error(`${field} must be an absolute path`);
      env[name] = config[field];
    }
  }
  if (env.JAVA_HOME) env.PATH = path.join(env.JAVA_HOME, 'bin') + path.delimiter + (env.PATH || env.Path || '');
  // An optional ASCII junction must refer to this repository, never another project.
  const buildRoot = config.projectRoot || repositoryRoot;
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (normalize(realpathSync(buildRoot)) !== normalize(realpathSync(repositoryRoot))) {
    throw new Error('Configured projectRoot does not refer to this GIFTO repository');
  }
  return { env, cwd: path.join(buildRoot, 'android') };
}
