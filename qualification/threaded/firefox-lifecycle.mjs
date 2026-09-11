// Audit externally received BiDi events, never worker self-reported termination.
export function requireLifecycle(events, { after, wanted, owner, origin, workerURLs = [] }) {
  if (!Number.isInteger(after) || after < 0 || after > events.length || (!Number.isInteger(wanted) || wanted < 1 || wanted > 9)) {
    throw new Error('lifecycle invalid audit bounds');
  }
  const selected = events.slice(after).map((event, i) => ({ ...event, index: after + i }));
  const creations = selected.filter(e => e.method === 'script.realmCreated' && e.params.type === 'dedicated-worker');
  if (creations.length !== wanted) throw new Error(`lifecycle creation count ${creations.length}; required ${wanted}`);
  const records = creations.map(created => {
    const { realm, owners } = created.params;
    // Firefox 155 reports the script URL here; preserve its raw value and only
    // accept the exact expected script URL in addition to the standard origin.
    const originMatches = created.params.origin === origin ||
      workerURLs.includes(created.params.origin);
    if (typeof realm !== 'string' || !originMatches ||
        !Array.isArray(owners) || owners.length !== 1 || owners[0] !== owner) {
      throw new Error('lifecycle worker ownership/origin mismatch');
    }
    const destructions = selected.filter(e => e.method === 'script.realmDestroyed' && e.params.realm === realm);
    if (destructions.length !== 1 || destructions[0].index <= created.index) {
      throw new Error(`lifecycle destruction missing, duplicated or out of order: ${realm}`);
    }
    return { realm, createdIndex: created.index, destroyedIndex: destructions[0].index };
  });
  return { method: 'WebDriver BiDi script.realmCreated + script.realmDestroyed',
    realms: records.map(r => r.realm), records, after, through: events.length };
}
