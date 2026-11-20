// Compiles backend/shop.cbl into backend/shop with GnuCOBOL (cobc).
// Run with: npm run build:cobol
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'backend', 'shop.cbl');
const output = path.join(root, 'backend', process.platform === 'win32' ? 'shop.exe' : 'shop');

const probe = spawnSync('cobc', ['--version']);
if (probe.error || probe.status !== 0) {
  console.error('cobc (GnuCOBOL) was not found.');
  console.error('In Codespaces: open the Command Palette and run "Codespaces: Rebuild Container".');
  process.exit(1);
}

const result = spawnSync('cobc', ['-x', '-free', '-o', output, source], { stdio: 'inherit' });
if (result.status === 0) console.log('COBOL backend built: ' + path.relative(root, output));
process.exit(result.status === null ? 1 : result.status);
