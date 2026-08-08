import oqs

def generate_keypair(algorithm: str = "ML-DSA-65"):
    """Generate a post-quantum signing keypair.

    Args:
        algorithm: The PQC signature algorithm name.

    Returns:
        (public_key: bytes, private_key: bytes)
    """
    signer = oqs.Signature(algorithm)
    public_key = signer.generate_keypair()
    private_key = signer.export_secret_key()
    return public_key, private_key


if __name__ == "__main__":
    pub, priv = generate_keypair()
    print(f"Public key length: {len(pub)} bytes")
    print(f"Private key length: {len(priv)} bytes")
