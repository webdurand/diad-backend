// Runner sequencial dos probes PROBE-015-*. Exit 0 = all green; 1 = qualquer falha.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const probes = readdirSync(__dirname)
  .filter((f) => f.startsWith('PROBE-015-') && f.endsWith('.mjs'))
  .sort();

let failedProbes = 0;
for (const probe of probes) {
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`▶ ${probe}`);
  console.log(`═══════════════════════════════════════════════════════`);
  const code = await new Promise((r) => {
    const p = spawn(process.execPath, [resolve(__dirname, probe)], {
      stdio: 'inherit',
      env: process.env,
    });
    p.on('exit', (c) => r(c ?? 1));
  });
  if (code !== 0) failedProbes++;
}

console.log(
  `\n═══════════════════════════════════════════════════════\n` +
    `Probes: ${probes.length - failedProbes}/${probes.length} GREEN\n` +
    `═══════════════════════════════════════════════════════`,
);
process.exit(failedProbes > 0 ? 1 : 0);
