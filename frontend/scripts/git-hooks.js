// Installs the local commit-msg hook (strips Copilot co-author trailers). Safe to re-run; never fails an install.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MARKER = '# canto-commit-msg';
const HOOK = `#!/bin/sh
${MARKER}
sed -i.bak '/^[Cc]o-[Aa]uthored-[Bb]y:.*Copilot/d' "$1" && rm -f "$1.bak"
`;

try {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: __dirname, encoding: 'utf8' });
  if (top.status !== 0) process.exit(0);
  const gitDir = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: top.stdout.trim(), encoding: 'utf8' }).stdout.trim();
  const hooks = path.resolve(top.stdout.trim(), gitDir, 'hooks');
  const file = path.join(hooks, 'commit-msg');
  if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(MARKER)) {
    console.log('commit-msg hook already exists; left unchanged.');
    process.exit(0);
  }
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(file, HOOK, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
} catch {
  // hooks are optional
}
