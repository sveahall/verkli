import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const server = process.argv[2] ?? '/app/apps/web/server.js';
const port = '3097';
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [server], {
  env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: port, BETA_LOCK: 'true', NEXT_PUBLIC_WAITLIST_ONLY: 'false', NEXT_PUBLIC_SUPABASE_URL: 'https://image-check.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'image-check-anon', NEXT_PUBLIC_SITE_URL: origin },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(`Server exited with ${child.exitCode}`);
    try { await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { await delay(100); }
  }
  if (!ready) throw Error('Server did not become ready');
  for (const path of ['/author', '/author/signin', '/waitlist', '/opengraph-image', '/logo-verkli.png', '/favi.svg']) {
    const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status !== 200) throw Error(`${path}: expected 200, received ${response.status}`);
    if (!(await response.arrayBuffer()).byteLength) throw Error(`${path}: empty response`);
    console.log(`[web image check] ${path}: 200`);
  }
} catch (error) {
  console.error(`[web image check] ${error.message}`);
  console.error(output);
  process.exitCode = 1;
} finally { child.kill('SIGTERM'); }
