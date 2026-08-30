#!/usr/bin/env node
/** Post-change verification hook. Runs only scripts declared by the target repository. */
import { spawn } from 'node:child_process';

const commands = (process.env.SECURITY_AUDIT_TEST_COMMANDS ?? 'test,build,lint')
  .split(',').map(s => s.trim()).filter(Boolean);

function run(script) {
  return new Promise(resolve => {
    const child = spawn('npm', ['run', script, '--if-present'], { stdio: 'inherit', shell: false });
    child.on('close', code => resolve({ command:`npm run ${script} --if-present`, exitCode:code ?? 1 }));
    child.on('error', error => resolve({ command:`npm run ${script} --if-present`, exitCode:1, error:error.message }));
  });
}

const results = [];
for (const command of commands) results.push(await run(command));
console.log(JSON.stringify({ generatedAt:new Date().toISOString(), results }, null, 2));
if (results.some(r => r.exitCode !== 0)) process.exit(1);
