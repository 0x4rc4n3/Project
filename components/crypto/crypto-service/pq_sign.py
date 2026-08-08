import oqs

def sign_data(data: bytes, private_key: bytes, algorithm: str = "ML-DSA-65") -> bytes:
    """Sign data using a post-quantum private key.

    Args:
        data: Raw bytes to sign.
        private_key: The exported secret key from generate_keypair().
        algorithm: The PQC signature algorithm name.

    Returns:
        signature: bytes
    """
    signer = oqs.Signature(algorithm, secret_key=private_key)
    return signer.sign(data)


def verify_signature(data: bytes, signature: bytes, public_key: bytes, algorithm: str = "ML-DSA-65") -> bool:
    """Verify a signature against data and a public key.

    Args:
        data: The original raw bytes.
        signature: The signature to check.
        public_key: The signer's public key.
        algorithm: The PQC signature algorithm name.

    Returns:
        valid: bool
    """
    verifier = oqs.Signature(algorithm)
    return verifier.verify(data, signature, public_key)
