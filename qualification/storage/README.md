# Same-instance storage qualification

Disposable F3 experiment, not an SDK. Baseline policy: one admitted owner,
rollback journal `TRUNCATE`, `synchronous=FULL`, memory-only temporary tables,
no WAL, ATTACH, secondary database or concurrent reader. Every SQL operation
runs on the bundled rusqlite SQLite instance inside its dedicated worker.

Node uses actual synchronous filesystem operations and a Linux kernel `flock`
on a permanent namespace lock file (never unlink or steal it). The installed
`flock` helper acquires the lock through an inherited open file description;
the worker retains the descriptor. Browser acquisition awaits exclusive OPFS
sync access handles for the database and journal before entering SQLite.
SQLite lock callbacks validate that whole-owner lease. There is no timeout
that steals a live owner's lock. This policy covers cooperating owners of the
same dedicated namespace, not unrelated SQLite tools or external file mutation.

OPFS uses two fixed real files. A journal of length zero is logically absent;
its synchronous delete is truncate-to-zero plus flush, retaining the physical
slot. No database serialization, copies, in-memory filesystem, separate SQLite
module, shared memory or fake generated glue is involved.

The first tracer test creates a synthetic SQL fixture, commits and closes,
terminates the worker, and verifies exact bytes in a fresh worker without
recreating or seeding. Later controls qualify crash recovery and errors.
Representative SQL is not wallet migration or scan/tree/outbox qualification.
