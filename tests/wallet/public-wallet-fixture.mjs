import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Supplemental native-generated funding stays separate from the accepted build fixture.
export async function publicWalletFixture(fixture,path) {
  if(!path)return null;
  const bytes=await readFile(path),receipt=JSON.parse(await readFile(`${path}.receipt.json`));
  assert.match(receipt.sourceCommit,/^[0-9a-f]{40}$/);
  assert.equal(receipt.generator,'generate_public_wallet_ironwood_funding');
  assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));
  const supplemental=JSON.parse(bytes);assert.deepEqual(Object.keys(supplemental),['publicWallet']);
  fixture.pczt.publicWallet=supplemental.publicWallet;
  fixture.pczt.ironwoodFunding=true;
  return {path,...receipt};
}
