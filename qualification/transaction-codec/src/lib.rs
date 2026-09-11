use serde::Deserialize;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::BranchId;

fn parse_exact(raw: &[u8], expected_branch: BranchId) -> Result<Transaction, String> {
    let mut remaining = raw;
    let tx = Transaction::read(&mut remaining, expected_branch).map_err(|e| format!("parse: {e}"))?;
    if !remaining.is_empty() {
        return Err("trailing bytes".into());
    }
    // V5/V6 carry their own branch; read() ignores the supplied branch for them.
    if tx.consensus_branch_id() != expected_branch {
        return Err("branch mismatch".into());
    }
    if !tx.version().valid_in_branch(expected_branch) {
        return Err("version/context mismatch".into());
    }
    Ok(tx)
}

/// Disposable qualification boundary, not a production host ABI or consensus validator.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
pub fn decode(raw: &[u8], branch: u32) -> Result<String, String> {
    let branch = BranchId::try_from(branch).map_err(|_| "unknown context branch")?;
    let tx = parse_exact(raw, branch)?;
    let mut written = Vec::new();
    tx.write(&mut written).map_err(|e| format!("write: {e}"))?;
    if written != raw {
        return Err("serialization differs from input".into());
    }
    Ok(serde_json::json!({
        "hex": hex::encode(written),
        "txid": hex::encode(tx.txid().as_ref()),
        "display": tx.txid().to_string(),
        "version": tx.version().header() & 0x7fffffff,
        "branch": u32::from(tx.consensus_branch_id()),
    }).to_string())
}

#[derive(Deserialize)]
struct Vector {
    name: String,
    hex: String,
    branch: u32,
    version: u32,
    txid: String,
    display: String,
}

fn vectors() -> Vec<Vector> {
    serde_json::from_str(include_str!("../fixtures/vectors.json")).unwrap()
}

/// The identical native/WASM suite, with expectations from frozen source vectors.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
pub fn qualify() -> Result<String, String> {
    rejects_lossy_serialization()?;
    let mut results = Vec::new();
    for v in vectors() {
        let raw = hex::decode(&v.hex).map_err(|e| e.to_string())?;
        let branch = BranchId::try_from(v.branch).map_err(str::to_owned)?;
        let observed: serde_json::Value = serde_json::from_str(&decode(&raw, v.branch)?).unwrap();
        if observed != serde_json::json!({"hex":v.hex,"txid":v.txid,"display":v.display,
            "branch":v.branch,"version":v.version}) {
            return Err(format!("{}: vector mismatch", v.name));
        }
        if hex::encode(hex::decode(&v.txid).unwrap().into_iter().rev().collect::<Vec<_>>()) != v.display
            || v.txid == v.display {
            return Err(format!("{}: display byte-order control", v.name));
        }
        // All short prefixes, plus body midpoint and missing last byte for larger vectors.
        let mut cuts: Vec<usize> = (0..raw.len().min(128)).collect();
        cuts.extend([raw.len() / 2, raw.len() - 1]);
        cuts.sort_unstable();
        cuts.dedup();
        for &cut in &cuts {
            if Transaction::read(&raw[..cut], branch).is_ok() {
                return Err(format!("{}: accepted truncated prefix {cut}", v.name));
            }
        }
        let mut malformed = raw.clone();
        malformed[4..8].fill(0); // unknown overwintered version-group pair
        if Transaction::read(malformed.as_slice(), branch).is_ok() {
            return Err(format!("{}: accepted invalid version group", v.name));
        }
        let mut trailing = raw.clone();
        trailing.push(0);
        // Establish real stream-parser behavior separately from our exact-byte guard.
        let mut unread = trailing.as_slice();
        let stream = Transaction::read(&mut unread, branch).map_err(|e| e.to_string())?;
        if unread != [0] || hex::encode(stream.txid().as_ref()) != v.txid
            || parse_exact(&trailing, branch).err().as_deref() != Some("trailing bytes") {
            return Err(format!("{}: trailing-byte control", v.name));
        }
        // A known but impossible version context is rejected, including pre-v5 input.
        let wrong = BranchId::Sprout;
        if parse_exact(&raw, wrong).is_ok() || decode(&raw, u32::MAX).is_ok() {
            return Err(format!("{}: context rejection", v.name));
        }
        if v.version >= 5 {
            let read_wrong = Transaction::read(raw.as_slice(), wrong).map_err(|e| e.to_string())?;
            if read_wrong.consensus_branch_id() != branch {
                return Err(format!("{}: embedded branch control", v.name));
            }
            malformed = raw.clone();
            malformed[8..12].fill(0xff);
            if Transaction::read(malformed.as_slice(), branch).is_ok() {
                return Err(format!("{}: accepted unknown embedded branch", v.name));
            }
        }
        results.push(serde_json::json!({"name":v.name,"bytes":raw.len(),"version":v.version,
            "branch":v.branch,"txid":v.txid,"display":v.display,
            "truncated_prefixes":cuts.len(),"roundtrip":true,"malformed":true,"context":true}));
    }
    // Non-canonical CompactSize (0 encoded with 0xfd) and over-limit element count.
    let v3 = hex::decode(&vectors()[0].hex).unwrap();
    for count in [&[0xfd, 0, 0][..], &[0xfe, 0xff, 0xff, 0xff, 0xff][..]] {
        let mut bad = v3[..8].to_vec();
        bad.extend_from_slice(count);
        bad.extend_from_slice(&v3[9..]);
        if Transaction::read(bad.as_slice(), BranchId::Overwinter).is_ok() {
            return Err("accepted malformed CompactSize".into());
        }
    }
    // Correctly encoded known branch but wrong version: read accepts, boundary rejects.
    let mut v6 = hex::decode(&vectors().last().unwrap().hex).unwrap();
    v6[8..12].copy_from_slice(&u32::from(BranchId::Nu5).to_le_bytes());
    if Transaction::read(v6.as_slice(), BranchId::Nu5).is_err()
        || parse_exact(&v6, BranchId::Nu5).err().as_deref() != Some("version/context mismatch") {
        return Err("V6/Nu5 context control".into());
    }
    Ok(serde_json::json!({"vectors":results,"compact_size_negatives":2,
        "v6_known_incompatible_branch":true,"lossy_serialization_negatives":1,"ok":true}).to_string())
}

// Review R1: parseable V4 with valueBalance=1 but no Sapling bundle.
fn rejects_lossy_serialization() -> Result<(), String> {
    let raw = hex::decode("0400008085202f89000000000000000000000100000000000000000000").unwrap();
    if decode(&raw, u32::from(BranchId::Sapling)).err().as_deref() != Some("serialization differs from input") {
        return Err("accepted lossy V4 serialization".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v6() -> Vec<u8> {
        hex::decode(&vectors().last().unwrap().hex).unwrap()
    }

    #[test]
    fn source_vectors_and_parser_negatives() {
        qualify().unwrap();
    }

    #[test]
    fn lossy_serialization_is_rejected() {
        rejects_lossy_serialization().unwrap();
    }

    #[test]
    fn trailing_bytes_are_rejected() {
        let mut raw = v6();
        raw.push(0);
        assert_eq!(parse_exact(&raw, BranchId::Nu6_3).err().as_deref(), Some("trailing bytes"));
    }

    #[test]
    fn embedded_branch_must_match_context() {
        assert_eq!(parse_exact(&v6(), BranchId::Nu5).err().as_deref(), Some("branch mismatch"));
    }

    #[test]
    fn version_must_be_allowed_in_context() {
        let mut raw = v6();
        raw[8..12].copy_from_slice(&u32::from(BranchId::Nu5).to_le_bytes());
        assert_eq!(parse_exact(&raw, BranchId::Nu5).err().as_deref(), Some("version/context mismatch"));
    }
}
