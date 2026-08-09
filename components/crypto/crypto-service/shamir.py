from sslib import shamir
import hashlib

def split_secret(secret: bytes, n: int, k: int):
    """Split a secret into n Shamir shares with threshold k.

    Returns a JSON-safe dict — all byte values are hex-encoded strings.
    """
    raw = shamir.split_secret(secret, k, n)
    hex_data = shamir.to_hex(raw)
    
    # Append SHA-256 checksum to each share string
    updated_shares = []
    for share in hex_data["shares"]:
        checksum = hashlib.sha256(share.encode('utf-8')).hexdigest()
        updated_shares.append(f"{share}:{checksum}")
        
    hex_data["shares"] = updated_shares
    return hex_data


def reconstruct_secret(shares_data: dict) -> bytes:
    """Reconstruct a secret from a threshold number of hex-encoded shares."""
    raw = shamir.from_hex(shares_data)
    return shamir.recover_secret(raw)
