// Vite owns subprocesses: isolate its build so abort can destroy all owned work.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function bundle(consumer, signal) {
  signal.throwIfAborted();
  const stdout = await open(join(consumer, 'build.stdout'), 'w');
  const stderr = await open(join(consumer, 'build.stderr'), 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), consumer], {
        detached: true, stdio: ['ignore', stdout.fd, stderr.fd],
      });
      let timer, failure;
      const kill = () => {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') failure = error; }
      };
      const abort = () => {
        failure = signal.reason;
        kill();
        timer = setTimeout(() => { child.unref(); finish(failure); }, 3000);
      };
      const finish = error => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        error ? reject(error) : resolve();
      };
      child.once('error', finish);
      child.once('close', code => {
        // Also reap any bundler service left behind on a normal/error exit.
        if (child.pid) kill();
        finish(failure || (code === 0 ? undefined : Error(`Vite build exited ${code}`)));
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    return await readFile(join(consumer, 'bundle.mjs'), 'utf8');
  } finally {
    await stdout.close(); await stderr.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { build } = await import('vite');
  const consumer = process.argv[2];
  const bundled = await build({ configFile: false, logLevel: 'silent', root: consumer, build: {
    write: false, minify: false, target: 'es2022', rolldownOptions: { output: { inlineDynamicImports: true } }, lib: { entry: join(consumer, 'entry.mjs'), formats: ['es'], fileName: 'bundle' } } });
  const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap(result => result.output);
  assert.equal(outputs.length, 1); assert.equal(outputs[0].type, 'chunk');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(consumer, 'bundle.mjs'), outputs[0].code);
}
