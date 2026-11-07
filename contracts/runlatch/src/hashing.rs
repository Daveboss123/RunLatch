//! Typed Borsh hashing; no arbitrary JSON field order or client-supplied price.

use near_sdk::{
    AccountId,
    borsh::{self, BorshSerialize},
    env,
};

pub fn hash_record<T: BorshSerialize>(
    domain: &str,
    network: &str,
    contract: &AccountId,
    value: &T,
) -> String {
    let encoded =
        borsh::to_vec(&(domain, network, contract, value)).expect("CANONICAL_ENCODING_FAILED");
    encode_hash(&env::sha256(&encoded))
}

pub fn encode_hash(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        result.push(HEX[(byte >> 4) as usize] as char);
        result.push(HEX[(byte & 15) as usize] as char);
    }
    result
}

pub fn decode_hash(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 {
        return None;
    }
    fn nibble(value: u8) -> Option<u8> {
        match value {
            b'0'..=b'9' => Some(value - b'0'),
            b'a'..=b'f' => Some(value - b'a' + 10),
            _ => None,
        }
    }
    let mut bytes = [0; 32];
    for (index, pair) in value.as_bytes().as_chunks::<2>().0.iter().enumerate() {
        bytes[index] = nibble(pair[0])? * 16 + nibble(pair[1])?;
    }
    Some(bytes)
}
