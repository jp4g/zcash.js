//! Synthetic public-protocol construction. No proofs or consensus-valid block claim.
use prost::Message;
use rand::SeedableRng;
use sha2::{Digest, Sha256};
use std::{convert::Infallible, num::NonZeroU32, time::{SystemTime, Duration}};
use rusqlite::Connection;
use zcash_client_backend::{data_api::{WalletWrite, AccountBirthday, anchor_retention::AnchorRetentionInterval,
    chain::{BlockSource, ChainState, error::Error}}, proto::compact_formats::*};
use zcash_client_sqlite::{WalletDb, util::Clock, wallet::init::WalletMigrator};
use zcash_keys::keys::UnifiedSpendingKey;
use zcash_primitives::block::BlockHash;
use zcash_protocol::{consensus::BlockHeight, local_consensus::LocalNetwork};
use zcash_note_encryption::Domain;
use zip32::Scope;

pub const START: u32 = 100_000;
pub fn network() -> LocalNetwork {
    LocalNetwork { overwinter: Some(1.into()), sapling: Some(START.into()), blossom: Some(START.into()),
        heartwood: Some(START.into()), canopy: Some(START.into()), nu5: Some(START.into()),
        nu6: Some(START.into()), nu6_1: Some(START.into()), nu6_2: Some(START.into()), nu6_3: Some(START.into()) }
}
#[derive(Clone, Copy)]
pub struct FixedClock;
impl Clock for FixedClock { fn now(&self) -> SystemTime { SystemTime::UNIX_EPOCH + Duration::from_secs(1740441600) } }
pub type Db<'a> = WalletDb<&'a mut Connection, LocalNetwork, FixedClock, rand::rngs::SmallRng>;
pub fn wallet(conn: &mut Connection) -> Db<'_> {
    WalletDb::from_connection(conn, network(), FixedClock, rand::rngs::SmallRng::seed_from_u64(0))
        .with_anchor_retention_interval(AnchorRetentionInterval::custom(NonZeroU32::new(2).unwrap()))
}
pub fn setup() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    rusqlite::vtab::array::load_module(&conn).unwrap();
    let mut db = wallet(&mut conn);
    WalletMigrator::new().init_or_migrate(&mut db).unwrap();
    db.create_account("synthetic F2", &secrecy::Secret::new(vec![0;32]), &AccountBirthday::from_parts(initial(), None), None).unwrap();
    conn
}
pub fn initial() -> ChainState { ChainState::empty((START-1).into(), BlockHash([0;32])) }
pub fn key(index: u32) -> UnifiedSpendingKey {
    UnifiedSpendingKey::from_seed(&network(), &[0;32], zip32::AccountId::try_from(index).unwrap()).unwrap()
}
pub fn bytes(label: &str) -> [u8;32] { Sha256::digest(label.as_bytes()).into() }
fn sapling_output(label: &str, fvk: &sapling::zip32::DiversifiableFullViewingKey, scope: Scope, value: u64, position: u64) -> (CompactSaplingOutput, sapling::Nullifier) {
    let recipient = match scope { Scope::External => fvk.default_address().1, Scope::Internal => fvk.change_address().1 };
    let note = sapling::Note::from_parts(recipient, sapling::value::NoteValue::from_raw(value), sapling::Rseed::AfterZip212(bytes(label)));
    let nf = note.nf(&fvk.to_nk(scope), position);
    let enc = sapling::note_encryption::sapling_note_encryption(Some(fvk.to_ovk(scope)), note.clone(), [0;512], &mut rand::rngs::SmallRng::seed_from_u64(0));
    (CompactSaplingOutput { cmu: note.cmu().to_bytes().to_vec(), ephemeral_key: sapling::note_encryption::SaplingDomain::epk_bytes(enc.epk()).0.to_vec(), ciphertext: enc.encrypt_note_plaintext()[..52].to_vec() }, nf)
}
fn ironwood_output(label: &str, account: u32, scope: Scope, value: u64, nf_old: orchard::note::Nullifier) -> (CompactOrchardAction, orchard::note::Nullifier) {
    let fvk = key(account).to_unified_full_viewing_key().orchard().unwrap().clone();
    let rho = orchard::note::Rho::from_bytes(&nf_old.to_bytes()).unwrap();
    let seed = orchard::note::RandomSeed::from_bytes(bytes(label), &rho).unwrap();
    let note = orchard::Note::from_parts(fvk.address_at(0u32, scope), orchard::value::NoteValue::from_raw(value), rho, seed, orchard::note::NoteVersion::V3).unwrap();
    let enc = orchard::note_encryption::IronwoodNoteEncryption::new(Some(fvk.to_ovk(scope)), note, [0;512]);
    (CompactOrchardAction { nullifier: nf_old.to_bytes().to_vec(), cmx: orchard::note::ExtractedNoteCommitment::from(note.commitment()).to_bytes().to_vec(), ephemeral_key: orchard::note_encryption::IronwoodDomain::epk_bytes(enc.epk()).0.to_vec(), ciphertext: enc.encrypt_note_plaintext()[..52].to_vec() }, note.nullifier(&fvk))
}
#[derive(Clone)]
pub struct Corpus(pub Vec<CompactBlock>);
impl BlockSource for Corpus {
    type Error = Infallible;
    fn with_blocks<F, E>(&self, from: Option<BlockHeight>, limit: Option<usize>, mut f: F) -> Result<(), Error<E, Infallible>>
    where F: FnMut(CompactBlock) -> Result<(), Error<E, Infallible>> {
        for b in self.0.iter().filter(|b| from.is_none_or(|h| b.height() >= h)).take(limit.unwrap_or(usize::MAX)) { f(b.clone())?; }
        Ok(())
    }
}
pub fn generate() -> Corpus {
    let own = key(0).to_unified_full_viewing_key();
    let other = key(1).to_unified_full_viewing_key();
    let mut txs: Vec<CompactTx> = (0..7).map(|i| CompactTx { index: 1, txid: bytes(&format!("tx-{i}")).to_vec(), ..Default::default() }).collect();
    let (out, snf) = sapling_output("sapling-receipt", own.sapling().unwrap(), Scope::External, 50_000, 0); txs[0].outputs.push(out);
    let dummy = orchard::note::Nullifier::from_bytes(&[1;32]).unwrap();
    let (out, inf) = ironwood_output("ironwood-receipt", 0, Scope::External, 70_000, dummy); txs[1].ironwood_actions.push(out);
    txs[2].spends.push(CompactSaplingSpend { nf: snf.0.to_vec() });
    txs[2].outputs.push(sapling_output("sapling-change", own.sapling().unwrap(), Scope::Internal, 30_000, 1).0);
    txs[2].outputs.push(sapling_output("sapling-payment", other.sapling().unwrap(), Scope::External, 20_000, 2).0);
    txs[3].ironwood_actions.push(ironwood_output("ironwood-change", 0, Scope::Internal, 45_000, inf).0);
    txs[3].ironwood_actions.push(ironwood_output("ironwood-payment", 1, Scope::External, 25_000, orchard::note::Nullifier::from_bytes(&[2;32]).unwrap()).0);
    for i in 0..1025 { txs[4].outputs.push(sapling_output(&format!("irrelevant-{i}"), other.sapling().unwrap(), Scope::External, 1, 3+i).0); }
    let (mut sapling_size, mut ironwood_size) = (0,0);
    let mut previous = vec![0;32];
    Corpus(txs.into_iter().enumerate().map(|(i, tx)| {
        sapling_size += tx.outputs.len() as u32; ironwood_size += tx.ironwood_actions.len() as u32;
        let hash = bytes(&format!("block-{i}")).to_vec();
        let b = CompactBlock { height: (START as u64)+i as u64, hash: hash.clone(), prev_hash: previous.clone(), time: 1740441600+i as u32,
            vtx: if i<5 { vec![tx] } else { vec![] }, chain_metadata: Some(ChainMetadata { sapling_commitment_tree_size: sapling_size, orchard_commitment_tree_size: 0, ironwood_commitment_tree_size: ironwood_size }), ..Default::default() };
        previous = hash; b
    }).collect())
}
pub fn frozen() -> Corpus {
    let blocks: [&[u8];7] = [
        include_bytes!("../fixtures/100000.pb"), include_bytes!("../fixtures/100001.pb"),
        include_bytes!("../fixtures/100002.pb"), include_bytes!("../fixtures/100003.pb"),
        include_bytes!("../fixtures/100004.pb"), include_bytes!("../fixtures/100005.pb"),
        include_bytes!("../fixtures/100006.pb"),
    ];
    Corpus(blocks.into_iter().map(|bytes| CompactBlock::decode(bytes).unwrap()).collect())
}

/// Reference frontier construction uses only the public incremental tree append API.
pub fn chain_state(blocks: &[CompactBlock]) -> ChainState {
    let mut s = incrementalmerkletree::frontier::Frontier::empty();
    let mut o = incrementalmerkletree::frontier::Frontier::empty();
    let mut i = incrementalmerkletree::frontier::Frontier::empty();
    for b in blocks { for tx in &b.vtx {
        for out in &tx.outputs { assert!(s.append(sapling::Node::from_bytes(out.cmu.as_slice().try_into().unwrap()).unwrap())); }
        for out in &tx.actions { assert!(o.append(orchard::tree::MerkleHashOrchard::from_bytes(out.cmx.as_slice().try_into().unwrap()).unwrap())); }
        for out in &tx.ironwood_actions { assert!(i.append(orchard::tree::MerkleHashOrchard::from_bytes(out.cmx.as_slice().try_into().unwrap()).unwrap())); }
    } }
    blocks.last().map_or_else(initial, |b| ChainState::new(b.height(), b.hash(), s, o, i))
}
