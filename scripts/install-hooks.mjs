// Copies scripts/pre-push into the repository's own hooks folder.
// The owner's global core.hooksPath hook calls this repo hook before its own work.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const hooksDir = path.resolve(execSync('git rev-parse --git-common-dir').toString().trim(), 'hooks');
fs.mkdirSync(hooksDir, { recursive: true });
const target = path.join(hooksDir, 'pre-push');
fs.copyFileSync('scripts/pre-push', target);
fs.chmodSync(target, 0o755);
console.log(`Хук установлен: ${target}`);
