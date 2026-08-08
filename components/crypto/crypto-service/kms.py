import os
import hvac
from keygen import generate_keypair

class KMS:
    """Production-grade Key Management Service (KMS) interfacing with HashiCorp Vault.

    Stores and retrieves the post-quantum ML-DSA-65 signing keypair directly
    within Vault's secure KV storage. No keys or key-parts are stored in local
    files or environment variables.
    """
    def __init__(self):
        self.vault_url = os.environ.get("VAULT_ADDR", "http://localhost:8200")
        self.vault_token = os.environ.get("VAULT_TOKEN", "scatterid-vault-root-token")
        self.client = None
        self._init_vault()

    def _init_vault(self):
        """Initialize and authenticate the Vault client.

        Raises:
            ConnectionError: If Vault is unreachable or authentication fails.
        """
        try:
            self.client = hvac.Client(url=self.vault_url, token=self.vault_token)
            if not self.client.is_authenticated():
                raise ConnectionError("KMS: Vault authentication failed. Invalid token.")
        except Exception as e:
            raise ConnectionError(f"KMS: Failed to connect to Vault at {self.vault_url}: {e}")

    def get_keys(self, algorithm: str = "ML-DSA-65"):
        """Retrieve the signing keypair from Vault, or generate a new one if not present.

        Args:
            algorithm: The post-quantum signature algorithm (default: ML-DSA-65).

        Returns:
            (public_key: bytes, private_key: bytes)
        """
        secret_path = "kms/issuer-key"
        mount_point = "secret"

        try:
            # Attempt to read existing keypair from Vault
            res = self.client.secrets.kv.v2.read_secret_version(
                path=secret_path,
                mount_point=mount_point
            )
            data = res["data"]["data"]
            public_key = bytes.fromhex(data["public_key"])
            private_key = bytes.fromhex(data["private_key"])
            return public_key, private_key
        except hvac.exceptions.InvalidPath:
            # Keys do not exist yet, generate and store them
            public_key, private_key = generate_keypair(algorithm)
            
            payload = {
                "public_key": public_key.hex(),
                "private_key": private_key.hex(),
            }
            
            self.client.secrets.kv.v2.create_or_update_secret(
                path=secret_path,
                secret=payload,
                mount_point=mount_point
            )
            return public_key, private_key
        except Exception as e:
            raise RuntimeError(f"KMS: Error communicating with Vault: {e}")

    def rotate_keys(self, algorithm: str = "ML-DSA-65"):
        """Rotate the active signing keypair in Vault.

        Args:
            algorithm: The signature algorithm to use.

        Returns:
            (public_key: bytes, private_key: bytes)
        """
        secret_path = "kms/issuer-key"
        mount_point = "secret"

        public_key, private_key = generate_keypair(algorithm)
        payload = {
            "public_key": public_key.hex(),
            "private_key": private_key.hex(),
        }

        try:
            self.client.secrets.kv.v2.create_or_update_secret(
                path=secret_path,
                secret=payload,
                mount_point=mount_point
            )
            return public_key, private_key
        except Exception as e:
            raise RuntimeError(f"KMS: Failed to rotate keys in Vault: {e}")
