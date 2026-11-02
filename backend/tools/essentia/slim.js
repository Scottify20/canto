// Keeps only the two files the analyzer needs (WASM build with the binary embedded + core API), then removes the full package.
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, 'node_modules', 'essentia.js', 'dist');
const lib = path.join(__dirname, 'lib');
fs.mkdirSync(lib, { recursive: true });
for (const f of ['essentia-wasm.umd.js', 'essentia.js-core.umd.js']) fs.copyFileSync(path.join(dist, f), path.join(lib, f));
fs.copyFileSync(path.join(__dirname, 'node_modules', 'essentia.js', 'LICENSE'), path.join(lib, 'LICENSE'));
fs.rmSync(path.join(__dirname, 'node_modules'), { recursive: true, force: true });
