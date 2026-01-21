import fs from 'node:fs';
import path from 'node:path';

function ok(msg) {
  process.stdout.write(`✅ ${msg}\n`);
}
function warn(msg) {
  process.stderr.write(`⚠️ ${msg}\n`);
}

const nodeVer = process.versions.node;
const [major] = nodeVer.split('.').map((x) => parseInt(x, 10));
if (!Number.isFinite(major) || major < 18) {
  warn(`Node.js ${nodeVer} detected. Vite 5 expects Node 18+.`);
}

const cwd = process.cwd();
const nm = path.join(cwd, 'node_modules');
if (!fs.existsSync(nm)) {
  warn('node_modules not found in repo root. Run: npm install');
  process.exit(1);
}

const required = [
  'react',
  'react-dom',
  'vite',
  '@types/react',
  '@types/react-dom',
  '@mediapipe/tasks-vision'
];

let missing = 0;
for (const pkg of required) {
  const p = path.join(nm, pkg);
  if (fs.existsSync(p)) ok(`${pkg} OK`);
  else {
    warn(`${pkg} missing`);
    missing += 1;
  }
}

if (missing) {
  warn('Some packages are missing. From repo root, run: npm install');
  process.exit(1);
}

ok('Environment looks good. If VS Code still shows TS errors, run: "TypeScript: Restart TS server"');
