import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.ts', 'utf8');
const hwpTool = fs.readFileSync('src/components/tools/HwpToPdfTool.tsx', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');
const compose = fs.readFileSync('docker-compose.yml', 'utf8');
assert.match(envExample, /USAGE_STORE_PATH=\.\/data\/usage-store\.json/, 'env example must document persistent free usage store path');
assert.match(compose, /USAGE_STORE_PATH:\s*\$\{USAGE_STORE_PATH:-\/app\/data\/usage-store\.json\}/, 'docker compose must persist free usage store in the data volume');

assert.match(server, /const FREE_DAILY_LIMIT = 3;/, 'free daily limit must be a shared server constant');
assert.match(server, /const USAGE_STORE_PATH = process\.env\.USAGE_STORE_PATH \|\| path\.resolve/, 'free usage must have an env-configurable persistent store path');
assert.match(server, /function readUsageStore\(\): UsageStore/, 'free usage must be read from a persistent store');
assert.match(server, /function writeUsageStore\(store: UsageStore\)/, 'free usage must be written to a persistent store');
assert.match(server, /fs\.renameSync\(tempPath, USAGE_STORE_PATH\)/, 'usage store writes must be atomic temp-file renames');
assert.doesNotMatch(server, /new Map<string, UsageRecord>/, 'free usage must not be memory-only');
assert.match(server, /function getFreeUsageContext\(req: Request\)/, 'free usage must use a single request context helper');
assert.match(server, /const usageBefore = checkUsageLimit\(usageContext\.key\)/, 'HWP to PDF upload must check usage before accepting a job');
assert.match(server, /FREE_DAILY_LIMIT_EXCEEDED/, 'HWP to PDF upload must return a deterministic daily-limit error code');
assert.match(server, /usageAfter = incrementUsage\(usageContext\.key\)/, 'HWP to PDF upload must increment usage when a free job is accepted');
assert.match(server, /usage:\s*usageAfter[\s\S]*remaining: usageAfter\.remaining/, 'accepted job response must include the updated remaining usage');
assert.match(server, /app\.get\('\/api\/usage'[\s\S]*getFreeUsageContext\(req\)/, 'usage endpoint must report the same usage bucket as uploads');
assert.match(server, /unlimited:\s*true/, 'premium/admin users should be marked unlimited in usage responses');

assert.match(hwpTool, /fetch\(`\$\{API_BASE\}\/api\/usage`, \{ credentials: 'include' \}\)/, 'frontend usage check must include auth cookies');
assert.match(hwpTool, /fetch\(`\$\{API_BASE\}\/api\/convert\/hwp-to-pdf`[\s\S]*credentials: 'include'/, 'frontend HWP upload must include auth cookies');
assert.match(hwpTool, /setUsageRemaining\(data\.usage\.remaining\)/, 'frontend must update remaining count from accepted upload response');
assert.match(hwpTool, /setUsageRemaining\(err\.remaining\)/, 'frontend must update remaining count from limit errors');

console.log('hwp-to-pdf free usage static contract passed');
