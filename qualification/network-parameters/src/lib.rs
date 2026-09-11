use zcash_protocol::consensus::{BlockHeight, BranchId, NetworkConstants, NetworkType, NetworkUpgrade, Parameters};
use wasm_bindgen::prelude::*;

const UPGRADES: [NetworkUpgrade; 10] = [
    NetworkUpgrade::Overwinter, NetworkUpgrade::Sapling, NetworkUpgrade::Blossom,
    NetworkUpgrade::Heartwood, NetworkUpgrade::Canopy, NetworkUpgrade::Nu5,
    NetworkUpgrade::Nu6, NetworkUpgrade::Nu6_1, NetworkUpgrade::Nu6_2, NetworkUpgrade::Nu6_3,
];
const KEYS: [&str; 10] = ["Overwinter", "Sapling", "Blossom", "Heartwood", "Canopy", "Nu5", "Nu6", "Nu6_1", "Nu6_2", "Nu6_3"];

#[derive(Clone, Debug)]
pub struct Document {
    encoding: NetworkType,
    heights: [Option<BlockHeight>; 10],
    bytes: Vec<u8>,
}
impl Parameters for Document {
    fn network_type(&self) -> NetworkType { self.encoding }
    fn activation_height(&self, nu: NetworkUpgrade) -> Option<BlockHeight> {
        UPGRADES.iter().position(|n| *n == nu).and_then(|i| self.heights[i])
    }
}
impl Document {
    pub fn parse(bytes: &[u8]) -> Result<Self, &'static str> {
        let invalid = "invalid network document";
        let text = std::str::from_utf8(bytes).map_err(|_| invalid)?;
        let rest = text.strip_prefix("{\"encoding\":\"").ok_or(invalid)?;
        let (name, mut rest) = rest.split_once('"').ok_or(invalid)?;
        let encoding = match name { "main" => NetworkType::Main, "test" => NetworkType::Test, "regtest" => NetworkType::Regtest, _ => return Err(invalid) };
        let mut heights = [None; 10];
        let mut previous = Some(0);
        for (i, key) in KEYS.iter().enumerate() {
            rest = rest.strip_prefix(&format!(",\"{key}\":")).ok_or(invalid)?;
            let end = rest.find([',', '}']).ok_or(invalid)?;
            let token = &rest[..end];
            let height = if token == "null" { None } else {
                let n = token.parse::<u32>().map_err(|_| invalid)?;
                if token != n.to_string() || previous.is_none_or(|p| n < p) { return Err(invalid); }
                Some(n)
            };
            heights[i] = height.map(BlockHeight::from_u32);
            previous = height;
            rest = &rest[end..];
        }
        if rest != "}" { return Err(invalid); }
        Ok(Self { encoding, heights, bytes: bytes.to_vec() })
    }
    pub fn bytes(&self) -> &[u8] { &self.bytes }
}

fn constants(p: &impl NetworkConstants) -> String {
    format!("[{},\"{}\",\"{}\",\"{}\",{:?},{:?},{:?},{:?},\"{}\",\"{}\",\"{}\",\"{}\"]",
        p.coin_type(), p.hrp_sapling_extended_spending_key(), p.hrp_sapling_extended_full_viewing_key(), p.hrp_sapling_payment_address(),
        p.b58_sprout_address_prefix(), p.b58_pubkey_address_prefix(), p.b58_secret_key_prefix(), p.b58_script_address_prefix(),
        p.hrp_tex_address(), p.hrp_unified_address(), p.hrp_unified_fvk(), p.hrp_unified_ivk())
}
/// Qualification observation only; JSON here is not the SDK host ABI.
#[wasm_bindgen]
pub fn observe(bytes: &[u8], height: u32) -> Result<String, String> {
    let p = Document::parse(bytes)?;
    let encoding = match p.network_type() { NetworkType::Main => "main", NetworkType::Test => "test", NetworkType::Regtest => "regtest" };
    let heights = UPGRADES.iter().map(|nu| p.activation_height(*nu).map_or("null".into(), |h| u32::from(h).to_string())).collect::<Vec<_>>().join(",");
    let active = UPGRADES.iter().map(|nu| p.is_nu_active(*nu, height.into()).to_string()).collect::<Vec<_>>().join(",");
    Ok(format!("{{\"encoding\":\"{encoding}\",\"heights\":[{heights}],\"branch\":{},\"active\":[{active}],\"constants\":{}}}", u32::from(BranchId::for_height(&p, height.into())), constants(&p)))
}
/// Golden facts are read from the pinned crate, never a copied crypto table.
pub fn source_constants() -> String {
    let branches = std::iter::once(u32::from(BranchId::Sprout)).chain(UPGRADES.iter().map(|nu| u32::from(nu.branch_id()))).map(|n| n.to_string()).collect::<Vec<_>>().join(",");
    format!("{{\"branches\":[{branches}],\"main\":{},\"test\":{},\"regtest\":{}}}", constants(&NetworkType::Main), constants(&NetworkType::Test), constants(&NetworkType::Regtest))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn bytes(values: &[Option<u32>; 10]) -> Vec<u8> {
        format!("{{\"encoding\":\"regtest\"{}}}", KEYS.iter().zip(values).map(|(key, h)| format!(",\"{key}\":{}", h.map_or("null".into(), |h| h.to_string()))).collect::<String>()).into_bytes()
    }
    #[test]
    fn immutable_parameters_and_every_boundary() {
        let mut input = bytes(&std::array::from_fn(|i| Some((i as u32 + 1) * 10)));
        let p = Document::parse(&input).unwrap();
        input.fill(0);
        assert_eq!(p.network_type(), NetworkType::Regtest);
        assert_eq!(p.hrp_unified_address(), NetworkType::Regtest.hrp_unified_address());
        assert_eq!(BranchId::for_height(&p, 0.into()), BranchId::Sprout);
        for (i, nu) in UPGRADES.iter().enumerate() {
            let h = (i as u32 + 1) * 10;
            assert_eq!(p.activation_height(*nu), Some(h.into()));
            assert!(!p.is_nu_active(*nu, (h - 1).into()));
            assert!(p.is_nu_active(*nu, h.into()));
            assert_eq!(BranchId::for_height(&p, (h - 1).into()), if i == 0 { BranchId::Sprout } else { UPGRADES[i - 1].branch_id() });
            assert_eq!(BranchId::for_height(&p, h.into()), nu.branch_id());
            assert_eq!(BranchId::for_height(&p, (h + 1).into()), nu.branch_id());
        }
        assert_eq!(p.bytes(), p.clone().bytes());
    }
    #[test]
    fn equal_max_and_unscheduled() {
        for h in [0, u32::MAX] {
            let p = Document::parse(&bytes(&[Some(h); 10])).unwrap();
            assert_eq!(BranchId::for_height(&p, h.into()), NetworkUpgrade::Nu6_3.branch_id());
        }
        let p = Document::parse(&bytes(&[None; 10])).unwrap();
        assert_eq!(BranchId::for_height(&p, u32::MAX.into()), BranchId::Sprout);
        let mut gap = [Some(10); 10]; gap[0] = None;
        assert!(Document::parse(&bytes(&gap)).is_err());
        let mut descending = [Some(10); 10]; descending[9] = Some(9);
        assert!(Document::parse(&bytes(&descending)).is_err());
    }
}
