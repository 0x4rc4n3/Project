from sslib import shamir

def split_secret(secret: bytes, n: int, k: int):
    """Split a secret into n Shamir shares with threshold k.

    Args:
        secret: The raw secret bytes to split.
        n: Total number of shares to generate.
        k: Minimum shares required to reconstruct.

    Returns:
        A JSON-safe dict (all byte values hex-encoded as strings).
    """
    raw = shamir.split_secret(secret, k, n)
    return shamir.to_hex(raw)


def reconstruct_secret(shares_data: dict) -> bytes:
    """Reconstruct a secret from a threshold number of hex-encoded shares.

    Args:
        shares_data: A dict of hex-encoded shares (as produced by split_secret).

    Returns:
        secret: bytes

    Raises:
        Exception: If fewer than the required threshold of shares is provided.
    """
    raw = shamir.from_hex(shares_data)
    return shamir.recover_secret(raw)
