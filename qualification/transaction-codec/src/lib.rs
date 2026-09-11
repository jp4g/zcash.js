use serde::Deserialize;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::BranchId;

fn parse_exact(raw: &[u8], expected_branch: BranchId) -> Result<Transaction, String> {
    Transaction::read(raw, expected_branch).map_err(|e| format!("parse: {e}"))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn v6() -> Vec<u8> {
        hex::decode(&vectors().last().unwrap().hex).unwrap()
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
