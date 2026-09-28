import assert from 'node:assert/strict';

const request = { format: 'unified', transparent: 'omit', sapling: 'omit', ironwood: 'require' };

// The database can commit before accounts.json is saved. Recover that account
// by checking its mnemonic instead of importing it again or replacing the seed.
export async function initializeAccount(wallet, saved, birthday) {
  const accounts = await wallet.accounts.list();
  assert.ok(accounts.length <= 1, 'init expects one account per wallet; preserve the directory and inspect it');
  let account = accounts[0];
  if (saved.accountId !== undefined) {
    assert.equal(account?.id, saved.accountId, 'saved account is missing or does not match this wallet');
  }
  const mnemonic = new TextEncoder().encode(saved.mnemonic);
  let signer;
  try {
    if (account) {
      assert.equal(account.accountIndex, 0, 'init expects derivation index zero');
      signer = await wallet.accounts.restoreSigner({ accountId: account.id, mnemonic });
    } else {
      const imported = await wallet.accounts.import({ mnemonic, accountIndex: 0, birthday: await birthday() });
      account = imported.account;
      signer = imported.signer;
    }
    let address = saved.address ?? await wallet.addresses.current({ accountId: account.id, request });
    if (!address) {
      const status = await wallet.sync({ signal: AbortSignal.timeout(180000) });
      assert.equal(status.targetReached, true, 'wallet did not reach its captured scan target');
      address = (await wallet.addresses.next({ accountId: account.id, request })).address;
    }
    return { ...saved, accountId: account.id, address };
  } finally {
    mnemonic.fill(0);
    await signer?.dispose();
  }
}
