const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Always local-only; sharing with other devices is switched on from Settings > Remote control in the app.
const backend = path.resolve(__dirname, '..', '..', 'backend');
const py = path.join(backend, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const r = spawnSync(py, ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8010'], {
  cwd: backend,
  stdio: 'inherit',
});
if (r.error) console.error('Backend venv not found. Run: npm run setup');
process.exit(r.status ?? 1);
