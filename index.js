/**
 * Production entrypoint for hosts that auto-detect index.js (e.g. Enzonic/Pterodactyl).
 * Starts server.ts with tsx loader compatible with Node 20.6+ / 22 / 24.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
