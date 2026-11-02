// One-command setup for a fresh clone: node scripts/setup.js [--skip-system] [--skip-app]
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const isWin = process.platform === 'win32';
const frontend = path.resolve(__dirname, '..');
const backend = path.resolve(frontend, '..', 'backend');
const args = new Set(process.argv.slice(2));

function has(cmd, versionArg = '--version') {
  return !spawnSync(cmd, [versionArg], { stdio: 'ignore', shell: isWin }).error;
}

function run(cmd, cmdArgs, cwd = frontend, allowFail = false) {
  console.log(`\n> ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: isWin });
  if (r.status !== 0 && !allowFail) {
    console.error(`\nFailed: ${cmd} ${cmdArgs.join(' ')}`);
    process.exit(r.status ?? 1);
  }
  return r.status === 0;
}

function setupLinuxSystem() {
  if (!has('apt-get')) {
    console.log(
      'Not a Debian/Ubuntu system: install the Tauri prerequisites manually\n' +
        'https://tauri.app/start/prerequisites/#linux',
    );
  } else {
    const root = process.getuid && process.getuid() === 0;
    run(root ? 'apt-get' : 'sudo', [
      ...(root ? [] : ['apt-get']),
      'install', '-y', 'build-essential', 'curl', 'wget', 'file', 'pkg-config', 'libssl-dev',
      'libwebkit2gtk-4.1-dev', 'libgtk-3-dev', 'librsvg2-dev', 'libayatana-appindicator3-dev',
      'libxdo-dev', 'ffmpeg',
    ], frontend, true);
  }
  if (!has('cargo')) {
    run('sh', ['-c', "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"]);
    console.log('Rust installed. Open a new terminal (or run `source ~/.cargo/env`) before building.');
  }
}

function setupWindowsSystem() {
  if (!has('winget')) {
    console.log('winget not found: install Rust (MSVC), VS Build Tools (C++ workload) and WebView2 manually.');
    return;
  }
  const common = ['--accept-package-agreements', '--accept-source-agreements', '-e'];
  run('winget', ['install', '--id', 'Rustlang.Rustup', ...common], frontend, true);
  run('winget', [
    'install', '--id', 'Microsoft.VisualStudio.2022.BuildTools', ...common,
    '--override', '"--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"',
  ], frontend, true);
  run('winget', ['install', '--id', 'Microsoft.EdgeWebView2Runtime', ...common], frontend, true);
  console.log('If Rust was just installed, open a new terminal before building.');
}

function setupBackend() {
  const venv = path.join(backend, 'venv');
  const py = path.join(venv, isWin ? 'Scripts/python.exe' : 'bin/python');
  if (!fs.existsSync(py)) {
    const system = ['python3', 'python', 'py'].find((c) => has(c));
    if (!system) {
      console.error('Python 3.11+ not found. Install it and re-run.');
      process.exit(1);
    }
    run(system, ['-m', 'venv', 'venv'], backend);
  }
  run(py, ['-m', 'pip', 'install', '-r', 'requirements.txt'], backend);
  // essentia.js: key + BPM engine used where the Essentia Python wheel is unavailable (Windows)
  run('npm', ['run', 'setup'], path.join(backend, 'tools', 'essentia'));
}

if (!args.has('--skip-system')) {
  if (isWin) setupWindowsSystem();
  else if (process.platform === 'linux') setupLinuxSystem();
}
if (!args.has('--skip-app')) {
  setupBackend();
  run('npm', ['install']);
}

console.log('\nSetup complete. Next: run the backend and `npm start` (see README), or `npm run build:linux:appimage` / `build:linux:deb` / `build:windows`.');
