import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Existing canonical files only; the TLS fixtures never download proving material.
export async function provingFixture(directory) {
  const result=new Map();if(!directory)return result;
  const inventory=JSON.parse(await readFile(`${directory}/parameters.json`));
  for(const [kind,digest] of [['spend','8e48ffd23abb3a5fd9c5589204f32d9c31285a04b78096ba40a79b75677efc13'],['output','2f0ebbcbb9bb0bcffe95a397e7eba89c29eb4dde6191c339db88570e3f3fb0e4']]) {
    const bytes=await readFile(`${directory}/sapling-${kind}.params`);
    assert.equal(inventory[kind].sha256,digest);assert.equal(bytes.length,inventory[kind].size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),digest);
    result.set(`/proving/sapling-${kind}.params`,bytes);
  }
  return result;
}
