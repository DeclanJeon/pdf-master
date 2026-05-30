import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');

assert.match(server, /const LOCAL_HWPFORGE_PATH = path\.resolve\(__dirname, '\.\.\/\.\.\/pdf-master-references\/HwpForge\/target\/release\/hwpforge'\);/, 'server must point at the sibling HwpForge binary');
assert.match(server, /const LEGACY_LOCAL_HWPFORGE_PATH = '\.\/pdf-master-references\/HwpForge\/target\/release\/hwpforge';/, 'server must recognize the legacy bad local env path');
assert.match(server, /const HWPFORGE_PATH = !IS_PRODUCTION && HWPFORGE_ENV_PATH === LEGACY_LOCAL_HWPFORGE_PATH/, 'server must remap the legacy path only in non-production');
assert.match(server, /: HWPFORGE_ENV_PATH \|\| \(IS_PRODUCTION \? '' : LOCAL_HWPFORGE_PATH\);/, 'server must keep production missing config visible');
assert.match(server, /execFileAsync\(HWPFORGE_PATH, \['convert-hwp5', inputPath, '-o', hwpxPath\], \{/s, 'server must keep using the resolved HwpForge path for conversion');

assert.match(envExample, /HWPFORGE_PATH=\.\.\/pdf-master-references\/HwpForge\/target\/release\/hwpforge/, '.env.example must point to the sibling HwpForge binary');
assert.doesNotMatch(envExample, /HWPFORGE_PATH=\.\/pdf-master-references\/HwpForge\/target\/release\/hwpforge/, '.env.example must not keep the old bad relative path');

console.log('hwpforge path static contract passed');
