// Key + BPM analysis with essentia.js (WebAssembly). Used where the native Essentia Python wheel does not exist (Windows).
// Input: raw mono float32 little-endian PCM at 44100 Hz on stdin. Output: one JSON line on stdout.
const EssentiaWASM = require('./lib/essentia-wasm.umd.js');
const Essentia = require('./lib/essentia.js-core.umd.js');

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const buf = Buffer.concat(chunks);
    const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
    const essentia = new Essentia(EssentiaWASM);
    const vec = essentia.arrayToVector(samples);
    const out = {};
    const key = essentia.KeyExtractor(vec, true, 4096, 4096, 12, 3500, 60, 25, 0.2, 'temperley', 44100, 0.0001, 440, 'cosine', 'hann');
    out.key = key.key;
    out.scale = key.scale;
    out.strength = key.strength;
    const rhythm = essentia.RhythmExtractor2013(vec, 208, 'multifeature', 40);
    out.bpm = rhythm.bpm;
    out.confidence = rhythm.confidence;
    process.stdout.write(JSON.stringify(out) + '\n');
  } catch (err) {
    process.stderr.write(String(err && err.stack || err));
    process.exit(1);
  }
});
