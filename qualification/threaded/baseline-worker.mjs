// Fresh immutable generated baseline instance; no threaded memory or request replay.
export async function baseline(data) {
  const bindings = await import(data.bindingsURL);
  const e = await bindings.default({ module_or_path: data.module });
  if (!(e.memory.buffer instanceof ArrayBuffer)) throw Error('baseline must be non-shared');
  const host = await import(new URL('./runtime-host.mjs', data.bindingsURL));
  host.attach(e.memory);
  if (e.rt_init(1) !== 0 || e.rt_open() !== 0) throw Error('baseline init');
  const schemaBefore = e.rt_fixture_schema_count();
  if (schemaBefore !== 0) throw Error('fallback was not fresh');
  // Deliberate synthetic probe performed once AFTER fresh-instance proof.
  const sql = e.rt_sql(), pairing = e.rt_pairing();
  if (sql !== 42 || pairing !== 1) throw Error('baseline fixture');
  return { mode: 'baseline', schemaBefore, sql, pairing, shared: false };
}
