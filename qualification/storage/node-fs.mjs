import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
// Linux qualification helper only. All fds are tracked by worker_threads and
// closed on termination; flock belongs to the retained open file description.
export function acquire(root, { create = false, crash = () => {} } = {}) {
  const base = fs.realpathSync(root);
  const lock = fs.openSync(`${base}/owner.lock`, fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW, 0o600);
  const result = spawnSync('/usr/bin/flock', ['-n', '3'], {
    stdio: ['ignore', 'ignore', 'ignore', lock], timeout: 5000,
  });
  if (result.error || result.status !== 0) {
    fs.closeSync(lock);
    throw Object.assign(Error('exclusive owner unavailable'), { code: result.status === 1 ? 'EBUSY' : 'EIO' });
  }
  let dir;
  try {
    dir = fs.openSync(base, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    if (!create) fs.accessSync(`${base}/wallet.db`, fs.constants.F_OK);
  } catch (e) { if (dir !== undefined) fs.closeSync(dir); fs.closeSync(lock); throw e; }
  const descriptors = new Set();
  const host = {
    owned: true, crash, directorySyncs: 0,
    inspect() {
      const result = {};
      for (const path of ['wallet.db', 'wallet.db-journal']) {
        try {
          const fd = fs.openSync(`${base}/${path}`, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
          try {
            const b = new Uint8Array(8); fs.readSync(fd, b, 0, 8, 0);
            result[path] = { size: fs.fstatSync(fd).size, header: Array.from(b) };
          } finally { fs.closeSync(fd); }
        } catch (e) { if (e.code !== 'ENOENT') throw e; result[path] = { size: 0, header: [] }; }
      }
      return result;
    },
    open(path, make) {
      const fd = fs.openSync(`${base}/${path}`, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | (make ? fs.constants.O_CREAT : 0), 0o600);
      descriptors.add(fd);
      // Persist namespace entries before journal/database writes can depend on them.
      fs.fsyncSync(dir); host.directorySyncs++; return fd;
    },
    close(fd) { fs.closeSync(fd); descriptors.delete(fd); },
    read: (fd, b, at) => fs.readSync(fd, b, 0, b.length, at),
    write: (fd, b, at) => fs.writeSync(fd, b, 0, b.length, at),
    truncate: (fd, size) => fs.ftruncateSync(fd, size),
    sync: fd => fs.fsyncSync(fd),
    size: fd => fs.fstatSync(fd).size,
    delete(path, sync) {
      try { fs.unlinkSync(`${base}/${path}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (sync) { fs.fsyncSync(dir); host.directorySyncs++; }
    },
    access(path, flags) {
      try { fs.accessSync(`${base}/${path}`, flags === 1 ? fs.constants.R_OK | fs.constants.W_OK : flags === 2 ? fs.constants.R_OK : fs.constants.F_OK); return true; }
      catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    },
    release() {
      if (!host.owned) return;
      // Hold the lease until every data descriptor is closed.
      for (const fd of descriptors) fs.closeSync(fd);
      descriptors.clear(); fs.closeSync(dir); fs.closeSync(lock); host.owned = false;
    },
  };
  return host;
}
