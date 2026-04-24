#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== StealthPay Relayer ==="
echo ""
echo "INFO: Starts the local private-withdraw relayer on http://127.0.0.1:${RELAYER_PORT:-8787}"
echo "INFO: Uses Alice's public dev key automatically for the local chain if RELAYER_PRIVATE_KEY is unset."
echo "INFO: For Paseo/testnet, export RELAYER_PRIVATE_KEY before starting."
echo "INFO: Set BULLETIN_SIGNER_MNEMONIC to enable app-managed encrypted gift payload uploads."
echo ""

cd "$ROOT_DIR/relayer"
npm install
npm run start
