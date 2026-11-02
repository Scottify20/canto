// Usage: node scripts/build-android.js <apk|aab>
// Builds the Angular app, syncs it into the Capacitor project and runs Gradle.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isWin = process.platform === 'win32';
const frontend = path.resolve(__dirname, '..');
const androidDir = path.join(frontend, 'android');
const kind = process.argv[2] === 'aab' ? 'aab' : 'apk';

function has(cmd) {
  return !spawnSync(cmd, ['-version'], { stdio: 'ignore', shell: isWin }).error;
}

function sdkDir() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Android', 'Sdk'),
    isWin && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.platform === 'darwin' && path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  ].filter(Boolean);
  return candidates.find((c) => fs.existsSync(path.join(c, 'platforms')) || fs.existsSync(path.join(c, 'cmdline-tools')));
}

const problems = [];
if (!has('java')) problems.push('JDK 17+ not found (install it and make sure `java` is on PATH).');
const sdk = sdkDir();
if (!sdk) problems.push('Android SDK not found. Install Android Studio or the command-line tools, or set ANDROID_HOME.');
if (problems.length) {
  console.error(`Cannot build for Android:\n- ${problems.join('\n- ')}\nSee "Android builds" in the README.`);
  process.exit(1);
}

// Gradle reads the SDK location from local.properties (git-ignored).
const localProps = path.join(androidDir, 'local.properties');
if (!fs.existsSync(localProps) && !process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  fs.writeFileSync(localProps, `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
}

function run(cmd, args, cwd = frontend) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const npx = isWin ? 'npx.cmd' : 'npx';
run(npx, ['ng', 'build']);
run(npx, ['cap', 'sync', 'android']);
run(isWin ? 'gradlew.bat' : './gradlew', [kind === 'aab' ? 'bundleRelease' : 'assembleDebug'], androidDir);

const out =
  kind === 'aab'
    ? 'android/app/build/outputs/bundle/release/ (unsigned: sign it before uploading to Play)'
    : 'android/app/build/outputs/apk/debug/app-debug.apk';
console.log(`\nDone: frontend/${out}`);
