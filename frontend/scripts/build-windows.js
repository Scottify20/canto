const { spawnSync } = require('node:child_process');

const target = 'x86_64-pc-windows-msvc';
const tauri = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const node = process.execPath;
const prep = spawnSync(node, [require('node:path').join(__dirname, 'prepare-backend-windows.js')], { stdio: 'inherit' });
if (prep.status !== 0) process.exit(prep.status ?? 1);

const args = ['build', '--bundles', 'nsis'];

if (process.platform !== 'win32') {
  // Cross-compile from Linux/macOS with cargo-xwin, which fetches the MSVC SDK itself.
  const missing = ['cargo-xwin', 'makensis', 'clang'].filter(
    (tool) => spawnSync(tool, ['--version'], { stdio: 'ignore' }).error,
  );
  if (missing.length) {
    console.error(
      `Missing tools for cross-compiling to Windows: ${missing.join(', ')}\n` +
        'Run: npm run setup:windows',
    );
    process.exit(1);
  }
  args.push('--runner', 'cargo-xwin', '--target', target);
}

const result = spawnSync(tauri, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
