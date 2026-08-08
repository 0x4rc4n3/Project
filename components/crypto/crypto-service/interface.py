import hashlib
import json
from datetime import datetime, timezone

from keygen import generate_keypair
from pq_sign import sign_data, verify_signature
from shamir import split_secret, reconstruct_secret


def package_credential(data: dict, private_key: bytes, n: int = 5, k: int = 3, algorithm: str = "ML-DSA-65"):
    """Hash, sign, and shard a claim into a SignedCredential.

    Args:
        data: The claim data (e.g. {"student": "X", "degree": "Y"}).
        private_key: Issuer's PQC private key.
        n: Total number of shares.
        k: Threshold required to reconstruct.
        algorithm: PQC signature algorithm name.

    Returns:
        A dict matching the SignedCredential shape from the
        Interface Contract: data_hash, signature, shares,
        algorithm, created_at.
    """
    raw_bytes = json.dumps(data, sort_keys=True).encode("utf-8")
    data_hash = hashlib.sha3_256(raw_bytes).hexdigest()

    signature = sign_data(raw_bytes, private_key, algorithm)

    split = split_secret(raw_bytes, n=n, k=k)

    return {
        "data_hash": data_hash,
        "signature": signature.hex(),
        "shares": split,
        "algorithm": algorithm,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def unpackage_credential(signed_credential: dict, public_key: bytes, shares_subset: list):
    """Verify and reconstruct data from a SignedCredential.

    Args:
        signed_credential: The dict produced by package_credential.
        public_key: Issuer's PQC public key.
        shares_subset: A list of at least k shares to use for
            reconstruction (subset of signed_credential["shares"]["shares"]).

    Returns:
        (data: bytes, valid: bool)
    """
    reconstruction_input = {
        "required_shares": signed_credential["shares"]["required_shares"],
        "prime_mod": signed_credential["shares"]["prime_mod"],
        "shares": shares_subset,
    }
    recovered_bytes = reconstruct_secret(reconstruction_input)

    signature_bytes = bytes.fromhex(signed_credential["signature"])
    valid = verify_signature(recovered_bytes, signature_bytes, public_key, signed_credential["algorithm"])

    return recovered_bytes, valid
