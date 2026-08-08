from flask import Flask, request, jsonify
from kms import KMS
from interface import package_credential, unpackage_credential
import os

app = Flask(__name__)

# Initialize KMS
kms = KMS()

# Load keys at startup directly from Vault
PUBLIC_KEY, PRIVATE_KEY = kms.get_keys()

# Load API key for verification
API_KEY = os.environ.get("CRYPTO_SERVICE_API_KEY")
if not API_KEY:
    raise ValueError(
        "CRITICAL: CRYPTO_SERVICE_API_KEY environment variable is not set. "
        "For security, the crypto-service cannot start without an API key."
    )

@app.before_request
def enforce_api_key():
    """Enforce Authorization: Bearer <API_KEY> for all endpoints."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized: Missing Bearer Token", "code": "UNAUTHORIZED"}), 401
    
    token = auth_header.split(" ")[1]
    if token != API_KEY:
        return jsonify({"error": "Unauthorized: Invalid API Key", "code": "UNAUTHORIZED"}), 401


@app.route("/package", methods=["POST"])
def package_route():
    data = request.get_json()
    if not data or "claim" not in data:
        return jsonify({"error": "Missing 'claim' field", "code": "BAD_REQUEST"}), 400

    credential = package_credential(data["claim"], PRIVATE_KEY)
    return jsonify(credential), 201


@app.route("/unpackage", methods=["POST"])
def unpackage_route():
    data = request.get_json()
    if not data or "credential" not in data or "sharesSubset" not in data:
        return jsonify({"error": "Missing 'credential' or 'sharesSubset' field", "code": "BAD_REQUEST"}), 400

    try:
        recovered_bytes, valid = unpackage_credential(
            data["credential"], PUBLIC_KEY, data["sharesSubset"]
        )
        return jsonify({
            "valid": valid,
            "recoveredData": recovered_bytes.decode("utf-8"),
        }), 200
    except Exception as e:
        return jsonify({"error": str(e), "code": "RECONSTRUCTION_FAILED"}), 400


@app.route("/rotate", methods=["POST"])
def rotate_route():
    global PUBLIC_KEY, PRIVATE_KEY
    try:
        PUBLIC_KEY, PRIVATE_KEY = kms.rotate_keys()
        return jsonify({
            "message": "Keys rotated successfully",
            "public_key_len": len(PUBLIC_KEY)
        }), 200
    except Exception as e:
        return jsonify({"error": str(e), "code": "ROTATION_FAILED"}), 500


if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = os.path.dirname(BASE_DIR)
    CERT_PATH = os.path.join(PROJECT_ROOT, "certs", "crypto-service.crt")
    KEY_PATH = os.path.join(PROJECT_ROOT, "certs", "crypto-service.key")

    if not os.path.exists(CERT_PATH) or not os.path.exists(KEY_PATH):
        raise FileNotFoundError(
            f"TLS Certificates not found at {CERT_PATH} or {KEY_PATH}. "
            "Please run certs/generate_certs.sh first."
        )

    # Run with HTTPS / SSL context
    app.run(port=5001, debug=True, ssl_context=(CERT_PATH, KEY_PATH))

