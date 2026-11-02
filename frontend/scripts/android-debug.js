// Usage: node scripts/android-debug.js [--no-install]
// Installs the debug APK on a USB-connected phone, launches Canto and forwards the WebView
// debugger to localhost:9222 (for chrome://inspect or the VS Code "Android: Attach" config).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_ID = 'com.canto.app';
const PORT = 9222;
const isWin = process.platform === 'win32';
const frontend = path.resolve(__dirname, '..');
const apk = path.join(frontend, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function exec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: isWin && !cmd.endsWith('.exe') });
  return { ok: !r.error && r.status === 0, out: (r.stdout || '') + (r.stderr || ''), error: r.error };
}

const sdkAdb = path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', isWin ? 'adb.exe' : 'adb');
const sdkEnvs = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]
  .filter(Boolean)
  .map((d) => path.join(d, 'platform-tools', isWin ? 'adb.exe' : 'adb'));
const candidates = [...new Set(['adb', ...sdkEnvs, sdkAdb, ...(isWin ? [] : ['adb.exe'])])];

function devicesOf(adb) {
  const r = exec(adb, ['devices']);
  if (!r.ok) return null;
  const lines = r.out.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2);
  return { ready: lines.filter((p) => p[1] === 'device'), unauthorized: lines.filter((p) => p[1] === 'unauthorized') };
}

let adb = null;
let unauthorized = false;
for (const c of candidates) {
  const d = devicesOf(c);
  if (!d) continue;
  if (d.unauthorized.length) unauthorized = true;
  if (d.ready.length) {
    adb = c;
    break;
  }
}

if (!adb) {
  console.error(
    unauthorized
      ? 'Phone found but not authorised: unlock it and accept the "Allow USB debugging" prompt, then re-run.'
      : 'No phone found by adb. Checklist:\n' +
          '- Enable Developer options and USB debugging on the phone, plug in via USB and accept the prompt.\n' +
          '- Run `npm run setup:android` if adb is not installed.\n' +
          '- WSL2: the phone is attached to Windows, so install Windows platform-tools (adb.exe on PATH),\n' +
          '  or attach the phone to WSL with usbipd-win, or use Wi-Fi debugging (`adb pair`/`adb connect`).',
  );
  process.exit(1);
}
console.log(`Using ${adb}`);

if (!process.argv.includes('--no-install')) {
  if (!fs.existsSync(apk)) {
    console.error('Debug APK not found. Run: npm run build:android:apk');
    process.exit(1);
  }
  let apkArg = apk;
  if (adb.endsWith('.exe') && !isWin) {
    const w = exec('wslpath', ['-w', apk]);
    if (w.ok) apkArg = w.out.trim();
  }
  const r = exec(adb, ['install', '-r', apkArg]);
  console.log(r.out.trim());
  if (!r.ok) process.exit(1);
}

exec(adb, ['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);

let pid = '';
for (let i = 0; i < 10 && !pid; i++) {
  pid = exec(adb, ['shell', 'pidof', APP_ID]).out.trim().split(/\s+/)[0];
  if (!pid) spawnSync(isWin ? 'timeout' : 'sleep', isWin ? ['/t', '1', '/nobreak'] : ['1'], { shell: isWin, stdio: 'ignore' });
}
if (!pid) {
  console.error('Could not find the running app. Open Canto on the phone and re-run with --no-install.');
  process.exit(1);
}

const fwd = exec(adb, ['forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`]);
if (!fwd.ok) {
  console.error(fwd.out);
  process.exit(1);
}

console.log(`
Canto is running on the phone (pid ${pid}). Debug it with either:
- Chrome/Edge: open chrome://inspect/#devices and click "inspect" under Canto.
- VS Code: run the "Android: Attach to Canto WebView" launch config (debugger port ${PORT}).
Logs from the backend appear in the \`npm run backend\` terminal.
Re-run this command if you restart the app (the WebView pid changes).`);
