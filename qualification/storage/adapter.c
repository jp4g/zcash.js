/* Derived allocator/time probe: runtime-provenance.json. Real storage callbacks below. */
#include "sqlite3.h"
#include <stdint.h>
#include <stddef.h>
#include <string.h>

_Static_assert(sizeof(void*) == 4 && sizeof(int) == 4, "wasm32 scalar ABI");
_Static_assert(sizeof(sqlite3_int64) == 8 && sizeof(double) == 8, "time ABI");
_Static_assert(_Alignof(double) == 8, "double alignment");

__attribute__((import_module("./storage-host.mjs"), import_name("entropy")))
extern int host_entropy(void*, int);
__attribute__((import_module("./storage-host.mjs"), import_name("utc_ms")))
extern double host_utc_ms(void);
__attribute__((import_module("./storage-host.mjs"), import_name("sleep")))
extern int host_sleep(int);

#define POOL_BYTES (16 * 1024 * 1024)
static struct {
  unsigned char before[64];
  _Alignas(8) unsigned char bytes[POOL_BYTES];
  unsigned char after[64];
} arena;
static int ready;
static int attempted;
static void *allocated[8192];

#define IMPORT(name) __attribute__((import_module("./storage-host.mjs"), import_name(#name)))
IMPORT(file_open) extern int file_open(const char*, int, int*);
IMPORT(file_close) extern int file_close(int);
IMPORT(file_read) extern int file_read(int, void*, int, sqlite3_int64);
IMPORT(file_write) extern int file_write(int, const void*, int, sqlite3_int64);
IMPORT(file_truncate) extern int file_truncate(int, sqlite3_int64);
IMPORT(file_sync) extern int file_sync(int, int);
IMPORT(file_size) extern int file_size(int, sqlite3_int64*);
IMPORT(file_lock) extern int file_lock(int, int);
IMPORT(file_unlock) extern int file_unlock(int, int);
IMPORT(file_reserved) extern int file_reserved(int, int*);
IMPORT(file_delete) extern int file_delete(const char*, int);
IMPORT(file_access) extern int file_access(const char*, int, int*);
IMPORT(host_error) extern int host_error(int, char*);
typedef struct { sqlite3_file base; int id; } HostFile;
static int close_file(sqlite3_file *f) { int rc = file_close(((HostFile*)f)->id); f->pMethods = 0; return rc; }
static int read_file(sqlite3_file *f, void *p, int n, sqlite3_int64 at) { return file_read(((HostFile*)f)->id, p, n, at); }
static int write_file(sqlite3_file *f, const void *p, int n, sqlite3_int64 at) { return file_write(((HostFile*)f)->id, p, n, at); }
static int truncate_file(sqlite3_file *f, sqlite3_int64 n) { return file_truncate(((HostFile*)f)->id, n); }
static int sync_file(sqlite3_file *f, int flags) { return file_sync(((HostFile*)f)->id, flags); }
static int size_file(sqlite3_file *f, sqlite3_int64 *n) { return file_size(((HostFile*)f)->id, n); }
static int lock_file(sqlite3_file *f, int level) { return file_lock(((HostFile*)f)->id, level); }
static int unlock_file(sqlite3_file *f, int level) { return file_unlock(((HostFile*)f)->id, level); }
static int reserved_file(sqlite3_file *f, int *out) { return file_reserved(((HostFile*)f)->id, out); }
static int control_file(sqlite3_file *f, int op, void *p) { return SQLITE_NOTFOUND; }
static int sector_file(sqlite3_file *f) { return 4096; }
static int device_file(sqlite3_file *f) { return 0; }
static const sqlite3_io_methods methods = {
 .iVersion=1, .xClose=close_file, .xRead=read_file, .xWrite=write_file,
 .xTruncate=truncate_file, .xSync=sync_file, .xFileSize=size_file,
 .xLock=lock_file, .xUnlock=unlock_file, .xCheckReservedLock=reserved_file,
 .xFileControl=control_file, .xSectorSize=sector_file, .xDeviceCharacteristics=device_file
};
static int open_file(sqlite3_vfs *v, const char *name, sqlite3_file *f, int flags, int *out) {
 f->pMethods = 0;
 if (!name || (strcmp(name,"/wallet.db") && strcmp(name,"/wallet.db-journal"))) return SQLITE_CANTOPEN;
 int id = 0, rc = file_open(name, flags, &id);
 if (rc) return rc;
 ((HostFile*)f)->id = id; f->pMethods = &methods;
 if (out) *out = flags;
 return SQLITE_OK;
}
static int delete_file(sqlite3_vfs *v, const char *name, int sync) { return file_delete(name, sync); }
static int access_file(sqlite3_vfs *v, const char *name, int flags, int *out) { return file_access(name, flags, out); }
static int path(sqlite3_vfs *v, const char *name, int size, char *out) {
  size_t n = strlen(name);
  if (size <= 0 || n >= (size_t)size) return SQLITE_CANTOPEN;
  memcpy(out, name, n + 1);
  return SQLITE_OK;
}
static void *dl_open(sqlite3_vfs *v, const char *name) { return 0; }
static void dl_error(sqlite3_vfs *v, int size, char *out) {
  if (size > 0) { const char *s = "host filesystem/extension unavailable";
    size_t n = strlen(s); if (n >= (size_t)size) n = (size_t)size - 1;
    memcpy(out, s, n); out[n] = 0; }
}
static void (*dl_sym(sqlite3_vfs *v, void *h, const char *s))(void) { return 0; }
static void dl_close(sqlite3_vfs *v, void *h) { }
static int randomness(sqlite3_vfs *v, int size, char *out) {
  if (size < 0 || host_entropy(out, size) != size) __builtin_trap();
  return size;
}
static int sleep_us(sqlite3_vfs *v, int us) { return host_sleep(us); }
static int time_ms(sqlite3_vfs *v, sqlite3_int64 *out) {
  double t = host_utc_ms();
  if (!(t >= 0 && t < 8000000000000000.0)) return SQLITE_IOERR;
  *out = (sqlite3_int64)t + INT64_C(210866760000000);
  return SQLITE_OK;
}
static int time_days(sqlite3_vfs *v, double *out) {
  sqlite3_int64 t;
  int rc = time_ms(v, &t);
  if (rc == SQLITE_OK) *out = (double)t / 86400000.0;
  return rc;
}
static int last_error(sqlite3_vfs *v, int size, char *out) {
  return host_error(size, out);
}
static sqlite3_vfs lower = {
  .iVersion = 2, .szOsFile = sizeof(HostFile), .mxPathname = 512,
  .zName = "storage-host", .xOpen = open_file, .xDelete = delete_file,
  .xAccess = access_file, .xFullPathname = path, .xDlOpen = dl_open, .xDlError = dl_error,
  .xDlSym = dl_sym, .xDlClose = dl_close, .xRandomness = randomness,
  .xSleep = sleep_us, .xCurrentTime = time_days, .xGetLastError = last_error,
  .xCurrentTimeInt64 = time_ms,
};

int sqlite3_os_init(void) { return sqlite3_vfs_register(&lower, 1); }
int sqlite3_os_end(void) { return sqlite3_vfs_unregister(&lower); }
int rt_ready(void) { return ready; }
int rt_init(int configure_pool) {
  if (attempted++) return SQLITE_MISUSE;
  char entropy[32];
  randomness(&lower, sizeof(entropy), entropy); /* Fail before any SQLite init. */
  memset(arena.before, 0xa5, sizeof(arena.before));
  memset(arena.after, 0x5a, sizeof(arena.after));
  if (configure_pool) {
    int rc = sqlite3_config(SQLITE_CONFIG_HEAP, arena.bytes, POOL_BYTES, 64);
    if (rc != SQLITE_OK) return rc;
  }
  int rc = sqlite3_initialize();
  if (rc != SQLITE_OK) return rc;
  if (sqlite3_vfs_find("storage-host") != &lower)
    return SQLITE_ERROR;
  ready = 1;
  return SQLITE_OK;
}
unsigned rt_pool_start(void) { return (unsigned)(uintptr_t)arena.bytes; }
unsigned rt_pool_size(void) { return POOL_BYTES; }
static int canaries(void) {
  for (unsigned i = 0; i < 64; ++i)
    if (arena.before[i] != 0xa5 || arena.after[i] != 0x5a) return 0;
  return 1;
}
int rt_pool_check(void) {
  if (!ready || !canaries()) return 0;
  unsigned n = 0;
  int ok = 1;
  for (; n < 8192; ++n) {
    void *p = sqlite3_malloc(4096);
    if (!p) break;
    allocated[n] = p;
    uintptr_t a = (uintptr_t)p, start = (uintptr_t)arena.bytes;
    if (a < start || a + sqlite3_msize(p) > start + POOL_BYTES || a % 8) ok = 0;
    memset(p, (int)(n & 255), 4096);
  }
  if (n == 8192 || n == 0 || sqlite3_memory_used() > POOL_BYTES) ok = 0;
  for (unsigned i = 0; i < n; ++i) {
    unsigned char *p = allocated[i];
    for (unsigned j = 0; j < 4096; ++j) if (p[j] != (i & 255)) ok = 0;
    sqlite3_free(p);
    allocated[i] = 0;
  }
  return ok && canaries();
}
int rt_hosts(void) {
  if (!ready) return 0;
  sqlite3_vfs *v = sqlite3_vfs_find("storage-host");
  char bytes[32];
  sqlite3_int64 time;
  if (v->xRandomness(v, sizeof(bytes), bytes) != sizeof(bytes)) return 0;
  if (v->xCurrentTimeInt64(v, &time) != SQLITE_OK) return 0;
  if (v->xSleep(v, 2000) < 2000) return 0;
  return 1;
}
double rt_time(void) {
  sqlite3_int64 time;
  if (!ready) return -1;
  sqlite3_vfs *v = sqlite3_vfs_find("storage-host");
  if (v->xCurrentTimeInt64(v, &time) != SQLITE_OK) return -1;
  return (double)time;
}

/* This bounded wrapper exposes no arbitrary SQL, and authorizes only the tested policy. */
static int authorize(void *p, int op, const char *a, const char *b, const char *db, const char *trigger) {
 if (op == SQLITE_ATTACH || op == SQLITE_DETACH) return SQLITE_DENY;
 if (op == SQLITE_PRAGMA && b) {
  if (!sqlite3_stricmp(a,"journal_mode") && sqlite3_stricmp(b,"truncate")) return SQLITE_DENY;
  if (!sqlite3_stricmp(a,"synchronous") && sqlite3_stricmp(b,"full") && strcmp(b,"2")) return SQLITE_DENY;
  if (!sqlite3_stricmp(a,"locking_mode") && sqlite3_stricmp(b,"normal")) return SQLITE_DENY;
  if (!sqlite3_stricmp(a,"temp_store") && sqlite3_stricmp(b,"memory") && strcmp(b,"2")) return SQLITE_DENY;
 }
 return SQLITE_OK;
}
int st_policy(sqlite3 *db) { return sqlite3_set_authorizer(db, authorize, 0); }

/* Direct ABI controls use this same registered VFS and real journal file before
 * any SQL database is opened. Never run these on a wallet containing a journal. */
int st_vfs_controls(void) {
 HostFile f; memset(&f, 0, sizeof(f));
 int out = 0, rc = lower.xOpen(&lower, "/wallet.db-journal", &f.base,
   SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_MAIN_JOURNAL, &out);
 if (rc) return rc;
 const sqlite3_io_methods *m = f.base.pMethods;
 unsigned char value[4] = {1,2,3,4}, read[16]; sqlite3_int64 size;
 if (m->xTruncate(&f.base,0) || m->xWrite(&f.base,value,4,4) || m->xFileSize(&f.base,&size) || size != 8) return SQLITE_ERROR;
 memset(read,0xee,sizeof(read));
 if (m->xRead(&f.base,read,16,0) != SQLITE_IOERR_SHORT_READ) return SQLITE_ERROR;
 for (int i=0;i<16;i++) if (read[i] != (i>=4 && i<8 ? value[i-4] : 0)) return SQLITE_ERROR;
 if (m->xTruncate(&f.base,6) || m->xFileSize(&f.base,&size) || size != 6 || m->xSync(&f.base,SQLITE_SYNC_FULL)) return SQLITE_ERROR;
 if (m->xClose(&f.base)) return SQLITE_ERROR;
 if (lower.xOpen(&lower,"/wallet.db-journal",&f.base,SQLITE_OPEN_READONLY | SQLITE_OPEN_MAIN_JOURNAL,&out)) return SQLITE_ERROR;
 if (f.base.pMethods->xWrite(&f.base,value,4,0) != SQLITE_READONLY || f.base.pMethods->xTruncate(&f.base,0) != SQLITE_READONLY) return SQLITE_ERROR;
 if (f.base.pMethods->xClose(&f.base) || lower.xDelete(&lower,"/wallet.db-journal",1)) return SQLITE_ERROR;
 if (lower.xAccess(&lower,"/wallet.db-journal",SQLITE_ACCESS_EXISTS,&out) || out != 0) return SQLITE_ERROR;
 if (lower.xDelete(&lower,"/wallet.db",1) != SQLITE_IOERR_DELETE) return SQLITE_ERROR;
 return SQLITE_OK;
}
