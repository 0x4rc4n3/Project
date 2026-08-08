from sslib import shamir

def split_secret(secret: bytes, n: int, k: int):
    """Split a secret into n Shamir shares with threshold k.

    Returns a JSON-safe dict — all byte values are hex-encoded strings.
    """
    raw = shamir.split_secret(secret, k, n)
    return shamir.to_hex(raw)


def reconstruct_secret(shares_data: dict) -> bytes:
    """Reconstruct a secret from a threshold number of hex-encoded shares."""
    raw = shamir.from_hex(shares_data)
    return shamir.recover_secret(raw)
