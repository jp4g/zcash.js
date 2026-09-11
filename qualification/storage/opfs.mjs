// Invoked only inside a dedicated worker, before entering synchronous SQLite.
export async function acquire(root, { create = false, crash = () => {} } = {}) {
  const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(root, { create });
  const handles = new Map();
  try {
    // Default readwrite mode is exclusive, never readwrite-unsafe. Main first:
    // holding it serializes journal acquisition and cleanup across all workers.
    for (const path of ['wallet.db', 'wallet.db-journal']) {
      const file = await directory.getFileHandle(path, { create: create || path.endsWith('-journal') });
      const access = await file.createSyncAccessHandle();
      handles.set(path, access);
    }
  } catch (e) { for (const h of handles.values()) h.close(); throw e; }
  const host = {
    owned: true, crash,
    inspect() {
      return Object.fromEntries([...handles].map(([path, h]) => {
        const b = new Uint8Array(8); h.read(b, { at: 0 });
        return [path, { size: h.getSize(), header: Array.from(b) }];
      }));
    },
    open(path, create) {
      const h = handles.get(path);
      if (!h || (!create && path.endsWith('-journal') && h.getSize() === 0)) throw Object.assign(Error('absent OPFS slot'), { code: 'ENOENT' });
      return h;
    },
    close() { /* SQLite file lifetime is shorter than the exclusive owner lease. */ },
    read: (h, b, at) => h.read(b, { at }),
    write: (h, b, at) => h.write(b, { at }),
    truncate: (h, n) => h.truncate(n),
    sync: h => h.flush(),
    size: h => h.getSize(),
    delete(path) { const h = handles.get(path); h.truncate(0); h.flush(); },
    access(path) { return path === 'wallet.db' || handles.get(path).getSize() > 0; },
    release() {
      if (!host.owned) return;
      // Release database last so another opener cannot race journal cleanup.
      handles.get('wallet.db-journal').close(); handles.get('wallet.db').close(); host.owned = false;
    },
  };
  return host;
}
