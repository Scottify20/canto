// One-time Android toolchain setup: node scripts/setup-android.js
// Linux/macOS: installs a JDK (Linux, via apt) and the Android SDK command-line tools into ~/Android/Sdk.
// Windows: installs Android Studio (which bundles a JDK and the SDK manager) via winget.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) {
    console.error(`Failed: ${cmd}`);
    process.exit(r.status ?? 1);
  }
}

function has(cmd) {
  return !spawnSync(cmd, ['-version'], { stdio: 'ignore', shell: isWin }).error;
}

if (isWin) {
  run('winget', [
    'install', '--id', 'Google.AndroidStudio', '-e',
    '--accept-package-agreements', '--accept-source-agreements',
  ]);
  console.log(
    '\nOpen Android Studio once and finish its setup wizard (it downloads the SDK),\n' +
      'then install "Android SDK Platform 36" in SDK Manager. Add Android Studio\'s JDK (jbr) to PATH or install JDK 21.',
  );
  process.exit(0);
}

if (!has('java')) {
  if (process.platform === 'linux' && has('apt-get')) {
    const root = process.getuid && process.getuid() === 0;
    run(root ? 'apt-get' : 'sudo', [...(root ? [] : ['apt-get']), 'install', '-y', 'openjdk-21-jdk-headless', 'unzip', 'curl']);
  } else {
    console.error('Install JDK 17+ (e.g. `brew install openjdk@21`) and re-run.');
    process.exit(1);
  }
}

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Android', 'Sdk');
const sdkmanager = path.join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager');

if (!fs.existsSync(sdkmanager)) {
  const tag = isMac ? 'mac' : 'linux';
  const zip = path.join(os.tmpdir(), 'android-cmdline-tools.zip');
  fs.mkdirSync(path.join(sdk, 'cmdline-tools'), { recursive: true });
  run('curl', ['-fL', '-o', zip, `https://dl.google.com/android/repository/commandlinetools-${tag}-11076708_latest.zip`]);
  run('unzip', ['-q', '-o', zip, '-d', path.join(sdk, 'cmdline-tools')]);
  fs.rmSync(path.join(sdk, 'cmdline-tools', 'latest'), { recursive: true, force: true });
  fs.renameSync(path.join(sdk, 'cmdline-tools', 'cmdline-tools'), path.join(sdk, 'cmdline-tools', 'latest'));
  fs.rmSync(zip, { force: true });
}

// Pipe "y" for licence prompts.
spawnSync(sdkmanager, ['--licenses'], { input: 'y\n'.repeat(30), stdio: ['pipe', 'ignore', 'inherit'] });
run(sdkmanager, [`--sdk_root=${sdk}`, 'platform-tools', 'platforms;android-36', 'build-tools;36.0.0']);

console.log(`\nAndroid SDK ready at ${sdk}. Build with: npm run build:android:apk`);
