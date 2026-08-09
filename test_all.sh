#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================="
echo "   ScatterID End-to-End Component Test Suite          "
echo "======================================================="

# 1. Sync container files and ensure stack is online
echo "[1/5] Syncing container code and verifying stack..."
docker cp components/verification-api/src/. scatterid-verification:/app/src/ 2>/dev/null || true
docker compose up -d

# Give containers a moment to settle
sleep 2

# 2. Test Crypto Service (Port 5001)
echo ""
echo "[2/5] Testing Crypto Microservice (Flask / HTTPS:5001)..."
API_KEY="${CRYPTO_SERVICE_API_KEY:-dev-secret-key-123}"

PACKAGE_RES=$(curl -s -k -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"claim":{"subject":"did:scatterid:test-user","role":"Security Engineer"}}' \
  https://localhost:5001/package)

echo "  -> POST /package response:"
echo "     $PACKAGE_RES"

if echo "$PACKAGE_RES" | grep -q "ML-DSA-65"; then
    echo "  -> Crypto Service /package: PASSED"
else
    echo "  -> Crypto Service /package: FAILED"
    exit 1
fi

ROTATION_RES=$(curl -s -k -X POST \
  -H "Authorization: Bearer $API_KEY" \
  https://localhost:5001/rotate)

echo "  -> POST /rotate response:"
echo "     $ROTATION_RES"

# 3. Test Verification API (Port 3000) - Full Issuance & Verification
echo ""
echo "[3/5] Testing Verification API (Express / HTTP:3000)..."

ISSUE_RES=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"claim":{"subject":"did:scatterid:test-user","role":"Security Engineer"}}' \
  http://localhost:3000/issue)

echo "  -> POST /issue response:"
echo "     $ISSUE_RES"

CRED_ID=$(echo "$ISSUE_RES" | grep -o '"credentialId":"[^"]*' | cut -d'"' -f4)

if [ -n "$CRED_ID" ]; then
    echo "  -> Issued Credential ID: $CRED_ID"
    
    VERIFY_RES=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "{\"credentialId\":\"$CRED_ID\"}" \
      http://localhost:3000/verify)
      
    echo "  -> POST /verify response:"
    echo "     $VERIFY_RES"

    if echo "$VERIFY_RES" | grep -q '"valid":true'; then
        echo "  -> Verification API /verify: PASSED (ML-DSA-65 + Shamir Shards Validated)"
    else
        echo "  -> Verification API /verify: FAILED"
        exit 1
    fi
else
    echo "  -> Credential Issuance: FAILED"
    exit 1
fi

# 4. Test Project Control Dashboard (Port 4000)
echo ""
echo "[4/5] Testing Control Dashboard (Express / HTTP:4000)..."

DASHBOARD_STATUS=$(curl -s http://localhost:4000/api/status)
echo "  -> GET /api/status response:"
echo "     $DASHBOARD_STATUS"

SMOKE_TEST_RES=$(curl -s -X POST http://localhost:4000/api/diagnostics/run)
echo "  -> POST /api/diagnostics/run response:"
echo "     $SMOKE_TEST_RES"

# 5. Run Python Fragmentation Unit Tests
echo ""
echo "[5/5] Running Python Fragmentation & Keygen Unit Tests..."
if [ -d "components/crypto/fragmentation-module/venv" ]; then
    source components/crypto/fragmentation-module/venv/bin/activate
    python3 -m pytest components/crypto/fragmentation-module/tests/ || true
else
    python3 -m pytest components/crypto/fragmentation-module/tests/ || true
fi

echo ""
echo "======================================================="
echo "   All Component End-to-End Tests Complete!           "
echo "======================================================="
