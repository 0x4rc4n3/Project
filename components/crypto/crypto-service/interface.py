import hashlib
import json
from datetime import datetime, timezone

from keygen import generate_keypair
from pq_sign import sign_data, verify_signature
from shamir import split_secret, reconstruct_secret


def package_credential(data: dict, private_key: bytes, public_key: bytes = None, n: int = 5, k: int = 3, algorithm: str = "ML-DSA-65"):
    """Hash, sign, and shard a claim into a SignedCredential.

    Args:
        data: The claim data (e.g. {"student": "X", "degree": "Y"}).
        private_key: Issuer's PQC private key.
        public_key: Optional Issuer's PQC public key (bytes).
        n: Total number of shares.
        k: Threshold required to reconstruct.
        algorithm: PQC signature algorithm name.

    Returns:
        A dict matching the SignedCredential shape from the
        Interface Contract: data_hash, signature, shares,
        algorithm, created_at, public_key (optional).
    """
    raw_bytes = json.dumps(data, sort_keys=True).encode("utf-8")
    data_hash = hashlib.sha3_256(raw_bytes).hexdigest()

    signature = sign_data(raw_bytes, private_key, algorithm)

    split = split_secret(raw_bytes, n=n, k=k)

    res = {
        "data_hash": data_hash,
        "signature": signature.hex(),
        "shares": split,
        "algorithm": algorithm,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if public_key:
        res["public_key"] = public_key.hex()
    return res


def unpackage_credential(signed_credential: dict, public_key, shares_subset: list):
    """Verify and reconstruct data from a SignedCredential.

    Args:
        signed_credential: The dict produced by package_credential.
        public_key: Issuer's PQC public key (bytes) or list of historical public keys.
        shares_subset: A list of at least k shares to use for
            reconstruction.

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
    algorithm = signed_credential.get("algorithm", "ML-DSA-65")

    keys_to_test = []
    if signed_credential.get("public_key"):
        try:
            keys_to_test.append(bytes.fromhex(signed_credential["public_key"]))
        except Exception:
            pass

    if isinstance(public_key, list):
        for k_item in public_key:
            if k_item not in keys_to_test:
                keys_to_test.append(k_item)
    elif public_key and public_key not in keys_to_test:
        keys_to_test.append(public_key)

    valid = False

    for key in keys_to_test:
        try:
            if verify_signature(recovered_bytes, signature_bytes, key, algorithm):
                valid = True
                break
        except Exception:
            continue

    return recovered_bytes, valid
