# Deployment Guide

This guide covers deploying the frontend, smart contracts, and parachain runtime.

## Frontend Deployment

The frontend is a static Vite app that works on any hosting platform. It uses hash-based routing (`HashRouter`) and relative asset paths (`base: "./"`) so it works correctly on IPFS gateways, GitHub Pages, and subdirectory deployments without configuration.

### GitHub Pages

The simplest option for public demos.

**Setup (one-time):**

1. Go to your repo **Settings > Pages**
2. Under **Source**, select **GitHub Actions**

**How it works:**

The workflow at `.github/workflows/deploy-github-pages.yml` runs automatically on push to `main`/`master`. It builds the frontend and deploys to GitHub Pages.

Your site will be available at:
```
https://<username>.github.io/<repo-name>/
```

**Manual trigger:**

Go to **Actions > Deploy to GitHub Pages > Run workflow** to trigger a deploy without pushing code.

### DotNS (IPFS + Polkadot naming)

Deploys the frontend to IPFS and registers a `.dot` domain that resolves to it via the Polkadot naming system.

**How it works:**

The workflow at `.github/workflows/deploy-frontend.yml` runs on push to `main`/`master`. It:

1. Builds the frontend
2. Uploads to IPFS
3. Registers/updates the DotNS domain via `paritytech/dotns-sdk`

The domain is set by the `basename` field in the workflow (default: `polkadot-stack-template00`). Domain registration is automatic (`register-base: true`). PR pushes create preview deployments under a `dev-` prefix.

**Configuration:**

- To use a custom domain, change `basename` in `.github/workflows/deploy-frontend.yml`
- For production deployments, set the `DOTNS_MNEMONIC` secret in your repo settings. The workflow falls back to the dev mnemonic for testing.

**Local IPFS deployment:**

You can also deploy to IPFS locally without CI:

```bash
# Install web3.storage CLI (one-time)
npm install -g @web3-storage/w3cli
w3 login your@email.com
w3 space create polkadot-stack-template

# Deploy
./scripts/deploy-frontend.sh
```

This builds the frontend, uploads to IPFS, and prints the gateway URL.

### Other platforms

Since the frontend is a static build, it works on any static hosting:

```bash
cd web && npm install && npm run build
# Output: web/dist/
```

Upload `web/dist/` to Vercel, Netlify, Cloudflare Pages, S3, or any static file server.

## Smart Contract Deployment

### Local dev node

Start the local chain with eth-rpc adapter, then deploy:

```bash
# Start node + eth-rpc (terminal 1)
./scripts/start-dev.sh
# Then in another terminal, start eth-rpc:
eth-rpc --dev

# Deploy EVM contract
cd contracts/evm && npm install && npm run deploy:local

# Deploy PVM contract
cd contracts/pvm && npm install && npm run deploy:local
```

Or use the all-in-one script that starts the node and deploys both contracts:

```bash
./scripts/start-dev-with-contracts.sh
```

Deploy scripts automatically write contract addresses to `deployments.json` (for CLI) and `web/src/config/deployments.ts` (for frontend). The frontend contract pages will auto-populate the address field.

### Polkadot TestNet

```bash
# Set your private key in each contract directory
cd contracts/evm && npx hardhat vars set PRIVATE_KEY
cd contracts/pvm && npx hardhat vars set PRIVATE_KEY

# Get testnet tokens
# Visit: https://faucet.polkadot.io/

# Deploy both contracts
./scripts/deploy-paseo.sh
```

TestNet details:
- **RPC**: `https://services.polkadothub-rpc.com/testnet`
- **Chain ID**: `420420417`
- **Explorer**: [blockscout-testnet.polkadot.io](https://blockscout-testnet.polkadot.io/)

## Parachain Runtime

### Local development

```bash
# Build and start with polkadot-omni-node
./scripts/start-dev.sh
```

This builds the runtime WASM, generates a chain spec, and starts the node. Endpoints:
- **Substrate RPC**: `ws://127.0.0.1:9944`
- **Ethereum RPC**: `http://127.0.0.1:8545` (requires `eth-rpc --dev` running separately)

### Docker

```bash
cd blockchain
docker compose up
```

### Zombienet (multi-node)

```bash
zombienet spawn blockchain/zombienet.toml
```

## CLI

The CLI reads contract addresses from `deployments.json` in the project root. After deploying contracts, it works immediately:

```bash
# Chain info
cargo run -p stack-cli -- chain info

# Pallet interaction (via Substrate RPC)
cargo run -p stack-cli -- pallet get alice
cargo run -p stack-cli -- pallet set 42
cargo run -p stack-cli -- pallet increment

# Contract interaction (via eth-rpc)
cargo run -p stack-cli -- contract info
cargo run -p stack-cli -- contract get evm alice
cargo run -p stack-cli -- contract set evm 42
cargo run -p stack-cli -- contract increment pvm --signer bob
```

Use `--url` and `--eth-rpc-url` flags to target different endpoints:

```bash
cargo run -p stack-cli -- --url wss://your-node:9944 --eth-rpc-url https://your-eth-rpc:8545 contract get evm alice
```
