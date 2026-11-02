// Assembles the backend for the Windows installer in src-tauri/backend-bundle/:
// embeddable Python 3.12 + Windows wheels + the app code + ffmpeg/ffprobe/fpcalc + node.exe with essentia.js.
// Works from Linux/WSL (pip downloads win_amd64 wheels) and from Windows.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PY_VERSION = '3.12.10';
const PY_ZIP = `https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-amd64.zip`;
const FFMPEG_ZIP = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
const NODE_ZIP = 'https://nodejs.org/dist/v22.12.0/node-v22.12.0-win-x64.zip';
const FPCALC_ZIP = 'https://github.com/acoustid/chromaprint/releases/download/v1.5.1/chromaprint-fpcalc-1.5.1-windows-x86_64.zip';

const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const cache = path.join(__dirname, '..', 'src-tauri', '.backend-cache');
const out = path.join(__dirname, '..', 'src-tauri', 'backend-bundle');
const win = process.platform === 'win32';
const venvPy = path.join(backend, 'venv', win ? 'Scripts/python.exe' : 'bin/python');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

async function download(url, name) {
  const file = path.join(cache, name);
  if (fs.existsSync(file)) return file;
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function unzip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  run(venvPy, ['-m', 'zipfile', '-e', zip, dest]);
}

function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    } else if (e.name.toLowerCase() === name) return p;
  }
  return null;
}

async function main() {
  if (!fs.existsSync(venvPy)) throw new Error('Backend venv not found. Run: npm run setup');
  fs.mkdirSync(cache, { recursive: true });
  fs.rmSync(out, { recursive: true, force: true });
  const py = path.join(out, 'python');
  const site = path.join(py, 'Lib', 'site-packages');
  fs.mkdirSync(site, { recursive: true });

  unzip(await download(PY_ZIP, `python-${PY_VERSION}-embed-amd64.zip`), py);
  // The embeddable build ignores PYTHONPATH; its ._pth file decides sys.path.
  fs.writeFileSync(path.join(py, 'python312._pth'), 'python312.zip\n.\nLib/site-packages\n../app_root\nimport site\n');

  const reqs = fs
    .readFileSync(path.join(backend, 'requirements.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .filter((l) => !/^essentia/i.test(l));
  const reqFile = path.join(cache, 'requirements.windows.txt');
  fs.writeFileSync(reqFile, reqs.join('\n') + '\n');
  run(venvPy, [
    '-m', 'pip', 'install', '--target', site, '--platform', 'win_amd64', '--python-version', '3.12',
    '--implementation', 'cp', '--only-binary=:all:', '--upgrade', '-r', reqFile,
  ]);

  const appRoot = path.join(out, 'app_root');
  fs.mkdirSync(appRoot, { recursive: true });
  for (const dir of ['app', 'beets_plugins']) {
    fs.cpSync(path.join(backend, dir), path.join(appRoot, dir), {
      recursive: true,
      filter: (src) => !src.includes('__pycache__'),
    });
  }

  const essentiaSrc = path.join(backend, 'tools', 'essentia');
  if (!fs.existsSync(path.join(essentiaSrc, 'lib'))) run('npm', ['run', 'setup'], { cwd: essentiaSrc, shell: win });
  fs.cpSync(essentiaSrc, path.join(appRoot, 'tools', 'essentia'), { recursive: true, filter: (src) => !src.includes('node_modules') });

  const bin = path.join(out, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const tools = [
    [FFMPEG_ZIP, 'ffmpeg.zip', ['ffmpeg.exe', 'ffprobe.exe']],
    [FPCALC_ZIP, 'fpcalc.zip', ['fpcalc.exe']],
    [NODE_ZIP, 'node.zip', ['node.exe']], // runs essentia.js (key + BPM), as the Essentia Python wheel has no Windows build
  ];
  for (const [url, name, files] of tools) {
    try {
      const tmp = path.join(cache, name + '.dir');
      fs.rmSync(tmp, { recursive: true, force: true });
      unzip(await download(url, name), tmp);
      for (const f of files) {
        const hit = findFile(tmp, f);
        if (hit) fs.copyFileSync(hit, path.join(bin, f));
      }
    } catch (e) {
      console.warn(`Skipping ${name}: ${e.message}`);
    }
  }
  console.log(`Backend bundle ready: ${out}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
