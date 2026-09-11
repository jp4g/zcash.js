export function validateEvidence(flat, count = 2) {
  if (!Array.isArray(flat) || flat.length !== count * 6) throw Error('Rayon evidence shape');
  const rows = Array.from({ length: count }, (_, i) => flat.slice(i * 6, (i + 1) * 6));
  for (let i = 0; i < count; i++) {
    if (rows[i][0] !== i || rows[i][1] !== i + 2 || rows[i][5] !== 65536) throw Error('Rayon worker identity/allocation');
    for (const column of [2, 3, 4]) if (rows[i][column] <= 0) throw Error('missing TLS/stack/heap address');
  }
  for (const column of [2, 3, 4]) if (new Set(rows.map(r => r[column])).size !== count) throw Error('aliased TLS/stack/heap');
  const allocations = rows.map(r => [r[4], r[4] + r[5] * 4]).sort((a,b) => a[0]-b[0]);
  for (let i = 1; i < count; i++) if (allocations[i][0] < allocations[i-1][1]) throw Error('overlapping live Rust allocations');
  return rows.map(([index, role, tls, stack, heap, words]) => ({ index, role, tls, stack, heap, words }));
}
