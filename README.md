# Polkadot Stack Template

A developer starter template demonstrating the full Polkadot technology stack through a **Proof of Existence** system — the same concept implemented as a Substrate pallet, a Solidity EVM contract, and a Solidity PVM contract. Drop a file, claim its hash on-chain, and optionally upload it to IPFS via the Bulletin Chain.

Students do not need to use every part of this repo. The runtime, pallet, contracts, frontend, CLI, Bulletin integration, Spektr integration, and deployment workflows are intentionally separated so teams can keep only the slices they want.

## StealthPay Status

This repo now also contains a working StealthPay product slice alongside the original Proof of Existence template:

- `Register`: derive a stealth meta-address from a dedicated seed and register it on the PVM contract
- `Private Send`: look up the recipient meta-address, derive a private delivery secret, encrypt the pool note plus optional text memo, upload it to Bulletin Chain, and call `announcePrivateDeposit`
- `Private Withdraw`: scan direct sender-to-pool announcements, decrypt the delivered pool note, generate a Groth16 proof, and withdraw through a relayer to a fresh destination
- `Public Recovery`: keep the older stealth-address recovery flow available as an advanced escape hatch for debugging and non-private fund recovery

Current StealthPay state:

- the consumer product shell is now gift-first: `Home`, `Wallet`, `Send Gift`, `Claim`, and `Advanced`
- `Send Gift` supports registered-recipient gifts and walletless bearer-link gifts
- gift sharing includes both a private link and a QR claim card
- walletless claims use Privy as the primary embedded H160 claim wallet provider
- encrypted Bulletin payload upload can be sponsored by the public relayer so normal users do not need to pre-authorize Bulletin storage
- the hosted relayer also exposes public-only indexing endpoints for exact deposit, announcement, and withdrawal lookup
- the Paseo sender path now uses Substrate `Revive.call(...)` with the measured value scale for the fixed `1 UNIT` pool

Current StealthPay gaps and risks:

- the working public demo is the normal browser deployment at `https://web-rouge-one-36.vercel.app`
- Dot.li hosting is isolated on the `codex/dotli-host-integration` branch because the P-wallet host transaction flow currently stalls on `Revive.map_account()` for unmapped accounts
- the current frontend still has some direct chain / ETH RPC reads, so Dot.li may show a direct-chain-access warning until those reads are moved behind the host API or relayer indexer
- `Revive.map_account()` works conceptually and is required for P-wallet accounts to call PVM contracts, but the Dot.li hosted signing path is not reliable enough for the main demo
- the long-term clean contract-write path should follow the Triangle User Agent demo pattern with `@polkadot-api/sdk-ink` dry-run + `send().signSubmitAndWatch(...)`; the current implementation still manually builds `Revive.call(...)`
- hidden stealth-to-pool shield-hop fallback is not active; the current judge-facing privacy story is sender-to-pool deposit plus relayed private withdrawal

Demo branch split:

- `master`: browser-demo stable app, external wallet + Privy path, deployed to Vercel
- `codex/browser-demo-stable`: same stable browser-demo history kept as a review branch
- `codex/dotli-host-integration`: Dot.li / Triangle host integration experiments and current P-wallet signing investigation

The product shell now exposes StealthPay through:

- `Wallet`
- `Send Gift`
- `Claim`
- `Advanced`

The older technical pages still exist underneath, but the top-level navigation is now aligned to the private-wallet direction rather than the raw protocol steps.

The current UX hardening pass also simplified the main working pages:

- `Send Gift` now hides contract addresses, transport choices, and raw claim internals behind advanced sections
- `Send Gift` now also has a gift-creation hero, simple three-step framing, recommended sender defaults, and a more narrative “gift created” state
- `Send Gift` now supports two privacy-preserving gift modes:
    - registered-recipient gifts keep the current meta-address targeting model
    - walletless bearer gifts create a sensitive claim link for recipients who do not have a wallet yet
- registered-recipient gifts now accept normal recipient identifiers:
    - EVM/H160 wallet addresses
    - Substrate extension accounts, resolved through `ReviveApi.address`
    - DotNS names such as `alice.dot`, `alice.paseo.li`, or `alice`
- if a recipient identifier resolves but that wallet has not registered a StealthPay private inbox, the send flow now routes the sender toward a walletless bearer gift link instead of ending in a technical error
- `Claim` now hides scan/proof details by default; registered-recipient gifts can be claimed directly, while walletless bearer gifts claim to an embedded H160 wallet when configured
- `Send Gift` now also produces a shareable gift link that lands on `#/gift` before continuing into the wallet-connected `#/claim` flow with pool, registry, and transaction context preloaded
- when a registered-recipient claim link is opened, `Claim` now uses a more guided path: unlock wallet, auto-search the linked gift, then claim privately through the relayer
- walletless bearer gifts use an embedded wallet provider when configured, with the browser-local encrypted vault kept as a fallback rather than the main path
- the route split is now explicit:
    - `#/claim` is the consumer gift-opening flow
    - `#/withdraw` remains the advanced technical claim/recovery surface
- on the consumer route, the happy path now defaults to the browser-extension wallet, keeps destination override behind disclosure, and moves recovery seed import deeper into recovery/troubleshooting settings
- the consumer route now also has a more gift-like presentation: a dedicated opening hero, a simple three-step narrative, and clearer private-claim success framing
- the sender/recipient handoff is now more product-like too:
    - `Send Gift` presents the claim link as a branded share card instead of just a raw URL
    - the shared link now lands on a dedicated `#/gift` handoff page before the wallet-connected `#/claim` flow
    - `Claim` shows a clearer “gift claimed privately” completion state after successful withdrawal
- the current distribution polish also now includes:
    - native browser share support where available
    - adaptive wallet-environment guidance on the `#/gift` page: if the browser cannot see an extension wallet, the primary action becomes copy/reopen instead of pushing the user into a dead-end claim
    - earlier unsupported-browser handling on `#/claim`, including a clearer reopen/copy/recovery branch instead of empty wallet selectors

## What's Inside

- **Polkadot SDK Blockchain** ([`blockchain/`](blockchain/)) — A Cumulus-based parachain compatible with `polkadot-omni-node`
    - **Substrate Pallet** ([`blockchain/pallets/template/`](blockchain/pallets/template/)) — FRAME pallet for creating and revoking Proof of Existence claims on-chain
    - **Parachain Runtime** ([`blockchain/runtime/`](blockchain/runtime/)) — Runtime wiring the pallet with smart contract support via `pallet-revive`
- **Smart Contracts** ([`contracts/`](contracts/)) — The same PoE example as Solidity, compiled to both EVM bytecode (solc) and PVM/RISC-V bytecode (resolc)
- **Frontend** ([`web/`](web/)) — React + TypeScript app using PAPI for pallet interactions and viem for contract calls
- **CLI** ([`cli/`](cli/)) — Rust CLI for chain queries, pallet operations, and contract calls via subxt and alloy
- **Dev Scripts** ([`scripts/`](scripts/)) — One-command scripts to build, start, and test the full stack locally

## Quick Start

### Docker (no Rust required)

```bash
# Start the parachain node + Ethereum RPC adapter (first build compiles the runtime ~10-20 min)
docker compose up -d

# Deploy contracts and start the frontend on the host
(cd contracts/evm && npm install && npm run deploy:local)
(cd contracts/pvm && npm install && npm run deploy:local)
(cd web && npm install && npm run dev)
# Frontend: http://127.0.0.1:5173
```

Only Node.js is needed on the host. The Docker build compiles the Rust runtime and generates the chain spec automatically. See [`contracts/README.md`](contracts/README.md) and [`web/README.md`](web/README.md) for the component-specific follow-up steps.

### Prerequisites (native)

- **OpenSSL** development headers (`libssl-dev` on Ubuntu, `openssl` on macOS)
- **protoc** Protocol Buffers compiler (`protobuf-compiler` on Ubuntu, `protobuf` on macOS)
- **Rust** (stable, installed via [rustup](https://rustup.rs/))
- **Node.js** 22.x LTS (`22.5+` recommended) and npm v10.9.0+
- **Polkadot SDK binaries** (stable2512-3): `polkadot`, `polkadot-prepare-worker`, `polkadot-execute-worker` (relay), `polkadot-omni-node`, `eth-rpc`, `chain-spec-builder`, and `zombienet`. Fetch them all into `./bin/` (gitignored) with:

    ```bash
    ./scripts/download-sdk-binaries.sh
    ```

    This is the primary supported native setup for this repo. The stack scripts (`start-all.sh`, `start-local.sh`, etc.) run the same step automatically unless you set `STACK_DOWNLOAD_SDK_BINARIES=0`. Versions match the **Key Versions** table below.

If your platform cannot use the downloader-managed binaries, see the limited-support fallback in [docs/INSTALL.md](docs/INSTALL.md#manual-binary-fallback-limited-support).

The repo includes [`.nvmrc`](.nvmrc) and `engines` fields in the JavaScript projects to keep everyone on the same Node major version.

### Run locally

```bash
# Start everything: node, contracts, and frontend in one command
./scripts/start-all.sh
# For explorer/debug runs that need historical block state:
./scripts/start-all-archive.sh
# Substrate RPC: ws://127.0.0.1:9944
# Ethereum RPC:  http://127.0.0.1:8545
# Frontend:      http://127.0.0.1:5173
```

`start-all.sh` is the recommended full-feature local path. It uses Zombienet under the hood so the Statement Store example works on `polkadot-sdk stable2512-3`.
If you know you will need historical block-state inspection in the explorer or runtime-event debugging over a longer run, use `./scripts/start-all-archive.sh` instead.

For the solo-node loop, relay-backed network, frontend-only startup, port overrides, or a second local stack, see [`scripts/README.md`](scripts/README.md).

For component-specific next steps, see:

- [`contracts/README.md`](contracts/README.md)
- [`web/README.md`](web/README.md)
- [`cli/README.md`](cli/README.md)

### StealthPay private-send demo

After `./scripts/start-all.sh`, start the local relayer in a second terminal:

```bash
./scripts/start-relayer.sh
```

For Paseo deployment and relayer use, the repo now reads secrets from a single repo-root
`.env` file. Copy [`.env.example`](.env.example) to `.env`, then fill in `PRIVATE_KEY` for
contract deployment and `RELAYER_PRIVATE_KEY` for the relayer. Set
`BULLETIN_SIGNER_MNEMONIC` on the relayer for production storage sponsorship, or use a
pre-authorized `BULLETIN_POOL_MNEMONIC` for the demo pool-account model. For walletless
claims, set `VITE_PRIVY_APP_ID`; Privy is the primary embedded H160 wallet provider in
the current architecture.

Then the current local private-send demo loop is:

1. Open `http://127.0.0.1:5173/#/register`
2. Register a recipient with either the local dev signer or a funded browser extension account
3. Keep the shown stealth seed backup if you want to restore the same recipient on another browser
4. Open `http://127.0.0.1:5173/#/send`
5. Send to the registered recipient through the privacy pool and optionally add a short private text memo
6. Encrypted gift payloads are uploaded by the storage sponsor when configured; users do not need to visit Bulletin first
7. On Paseo, the default `Substrate Revive.call` path submits the actual pool deposit with the same Substrate wallet used for the product flow
8. Copy the generated claim link or open `http://127.0.0.1:5173/#/claim`
9. Use the same recipient signer (or import the saved stealth seed), let the claim page preload the gift context, unlock the wallet, and claim privately through the relayer
10. Use `http://127.0.0.1:5173/#/scan` only when you need the older public recovery path

The claim page uses the recent block range only to find incoming gift announcements. Pool deposit history is scanned from the start so the app can reconstruct the full Merkle path for older pool leaves automatically.

### Lint & format

```bash
# Rust (requires nightly for rustfmt config options)
cargo +nightly fmt              # format
cargo +nightly fmt --check      # check only
cargo clippy --workspace        # lint

# Frontend (web/)
cd web && npm run fmt           # format
cd web && npm run fmt:check     # check only
cd web && npm run lint          # eslint

# Contracts (contracts/evm/ and contracts/pvm/)
cd contracts/evm && npm run fmt
cd contracts/pvm && npm run fmt
```

### Run tests

```bash
# Pallet unit tests
cargo test -p pallet-template

# All tests including benchmarks
SKIP_PALLET_REVIVE_FIXTURES=1 cargo test --workspace --features runtime-benchmarks

# Statement Store runtime + CLI coverage
cargo test -p stack-template-runtime
cargo test -p stack-cli

# Relay-backed Statement Store smoke test
./scripts/test-statement-store-smoke.sh

# Solidity tests (local Hardhat network)
cd contracts/evm && npx hardhat test
cd contracts/pvm && npx hardhat test
```

## Documentation

- [docs/TOOLS.md](docs/TOOLS.md) - All Polkadot stack components used in this template
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide (GitHub Pages, DotNS, contracts, runtime)
- [docs/INSTALL.md](docs/INSTALL.md) - Detailed setup instructions
- [docs/DEMO_DIAGRAMS.md](docs/DEMO_DIAGRAMS.md) - StealthPay demo diagrams, trust boundaries, and talk track
- [docs/BUG_REPORTS.md](docs/BUG_REPORTS.md) - StealthPay stack bugs and integration surprises discovered during the build
- [docs/STEALTHPAY_JOURNEY.md](docs/STEALTHPAY_JOURNEY.md) - Build retrospective and current demo status
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Current StealthPay architecture notes and remaining gaps
- [docs/CRYPTO.md](docs/CRYPTO.md) - StealthPay crypto working spec for the implemented flows

## Using Only What You Need

- **Pallet only**: Keep [`blockchain/pallets/template/`](blockchain/pallets/template/), [`blockchain/runtime/`](blockchain/runtime/), and optionally [`cli/`](cli/). You can ignore `contracts/`, `web/src/components/ContractProofOfExistencePage.tsx`, and `eth-rpc`.
- **Contracts only**: Keep [`contracts/`](contracts/) plus the `Revive` runtime wiring in [`blockchain/runtime/`](blockchain/runtime/). The pallet and Bulletin integration are optional.
- **Frontend only**: The core PoE UI lives in [`web/src/pages/PalletPage.tsx`](web/src/pages/PalletPage.tsx), [`web/src/pages/EvmContractPage.tsx`](web/src/pages/EvmContractPage.tsx), and [`web/src/pages/PvmContractPage.tsx`](web/src/pages/PvmContractPage.tsx). The Accounts page, Spektr support, and Bulletin upload hook can be removed without affecting the basic claim flows.
- **Optional integrations**: Bulletin Chain, Spektr, and DotNS are isolated extras. They are documented locally in [docs/TOOLS.md](docs/TOOLS.md) and can be skipped entirely for workshops or hackathons.

## Key Versions

| Component          | Version                                 |
| ------------------ | --------------------------------------- |
| polkadot-sdk       | stable2512-3 (umbrella crate v2512.3.3) |
| polkadot           | v1.21.3 (relay chain binary)            |
| polkadot-omni-node | v1.21.3 (from stable2512-3 release)     |
| eth-rpc            | v0.12.0 (Ethereum JSON-RPC adapter)     |
| chain-spec-builder | v16.0.0                                 |
| zombienet          | v1.3.133                                |
| pallet-revive      | v0.12.2 (EVM + PVM smart contracts)     |
| Node.js            | 22.x LTS                                |
| Solidity           | v0.8.28                                 |
| resolc             | v1.0.0                                  |
| PAPI               | v1.23.3                                 |
| React              | v18.3                                   |
| viem               | v2.x                                    |
| alloy              | v1.8                                    |
| Hardhat            | v2.27+                                  |

## Resources

- [Polkadot Smart Contract Docs](https://docs.polkadot.com/smart-contracts/overview/)
- [Polkadot SDK Documentation](https://paritytech.github.io/polkadot-sdk/master/)
- [PAPI Documentation](https://papi.how/)
- [Polkadot Faucet](https://faucet.polkadot.io/) (TestNet tokens)
- [Blockscout Explorer](https://blockscout-testnet.polkadot.io/) (Polkadot TestNet)
- [Bulletin Chain Authorization](https://paritytech.github.io/polkadot-bulletin-chain/) - authorize the relayer storage-sponsor account once for app-managed encrypted payload uploads; direct user authorization remains an advanced fallback only.

## StealthPay Public Event Indexing

StealthPay does not use a private database for gifts or notes. The frontend only indexes public events:

- first: the StealthPay public indexer exposed by the relayer
- fallback: optional Blockscout address logs on Paseo
- fallback: direct `eth_getLogs`
- fallback: bounded `Revive.ContractEmitted` runtime-event decoding

Configure the hosted indexer path in `web/.env.local` if needed:

```bash
VITE_RELAYER_URL=https://stealthpay-relayer.onrender.com
VITE_STEALTHPAY_INDEXER_URL=https://stealthpay-relayer.onrender.com
```

Set `VITE_STEALTHPAY_INDEXER_KIND=none` to force direct RPC/runtime scanning.

## License

[MIT](LICENSE)
