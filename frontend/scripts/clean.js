// Usage: node scripts/clean.js [--deps] [--dry-run]
// Default removes build output and caches. --deps also removes node_modules and the backend venv.
// User data (backend/beets_data) is never touched.
const fs = require('node:fs');
const path = require('node:path');

const frontend = path.resolve(__dirname, '..');
const root = path.resolve(frontend, '..');
const backend = path.join(root, 'backend');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const targets = [
  path.join(frontend, 'dist'),
  path.join(frontend, '.angular'),
  path.join(frontend, 'coverage'),
  path.join(frontend, 'src-tauri', 'target'),
  path.join(frontend, 'src-tauri', 'gen', 'schemas'),
  path.join(frontend, 'android', 'build'),
  path.join(frontend, 'android', 'app', 'build'),
  path.join(frontend, 'android', '.gradle'),
  path.join(backend, '.pytest_cache'),
];

if (args.has('--deps')) {
  targets.push(path.join(frontend, 'node_modules'), path.join(backend, 'venv'));
}

const skip = new Set(['venv', 'node_modules', 'beets_data', '.git']);
function findPycache(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === '__pycache__') targets.push(full);
    else findPycache(full);
  }
}
findPycache(backend);

let removed = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  console.log(`${dryRun ? 'Would remove' : 'Removing'} ${path.relative(root, target)}`);
  if (!dryRun) fs.rmSync(target, { recursive: true, force: true });
  removed++;
}
console.log(removed ? `${dryRun ? 'Would remove' : 'Removed'} ${removed} item(s).` : 'Nothing to clean.');
