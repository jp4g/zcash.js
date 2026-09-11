/* Disposable same-instance lower VFS. Actual database I/O belongs to memdb. */
#include "sqlite3.h"
#include <stdint.h>
#include <stddef.h>
#include <string.h>

_Static_assert(sizeof(void*) == 4 && sizeof(int) == 4, "wasm32 scalar ABI");
_Static_assert(sizeof(sqlite3_int64) == 8 && sizeof(double) == 8, "time ABI");
_Static_assert(_Alignof(double) == 8, "double alignment");

__attribute__((import_module("./runtime-host.mjs"), import_name("entropy")))
extern int host_entropy(void*, int);
__attribute__((import_module("./runtime-host.mjs"), import_name("utc_ms")))
extern double host_utc_ms(void);
__attribute__((import_module("./runtime-host.mjs"), import_name("sleep")))
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

static int unavailable_open(sqlite3_vfs *v, const char *name, sqlite3_file *f,
                            int flags, int *out) {
  f->pMethods = 0;
  return SQLITE_CANTOPEN;
}
static int unavailable_delete(sqlite3_vfs *v, const char *name, int sync) {
  return SQLITE_IOERR_DELETE;
}
static int absent(sqlite3_vfs *v, const char *name, int flags, int *out) {
  *out = 0; /* This lower VFS has no filesystem namespace. */
  return SQLITE_OK;
}
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
  dl_error(v, size, out);
  return SQLITE_CANTOPEN;
}
static sqlite3_vfs lower = {
  .iVersion = 2, .szOsFile = sizeof(sqlite3_file), .mxPathname = 512,
  .zName = "runtime-host", .xOpen = unavailable_open, .xDelete = unavailable_delete,
  .xAccess = absent, .xFullPathname = path, .xDlOpen = dl_open, .xDlError = dl_error,
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
  if (sqlite3_vfs_find("runtime-host") != &lower || !sqlite3_vfs_find("memdb"))
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
  sqlite3_vfs *v = sqlite3_vfs_find("memdb");
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
  sqlite3_vfs *v = sqlite3_vfs_find("memdb");
  if (v->xCurrentTimeInt64(v, &time) != SQLITE_OK) return -1;
  return (double)time;
}
