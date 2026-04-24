# StealthPay — Architecture and PRD Context

## Current Repo Status

This file still contains the imported StealthPay PRD below, but the repo now has real implementation state that should take precedence over any aspirational sections.

Implemented in this repo now:

- browser stealth crypto in [web/src/crypto/stealth.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/stealth.ts)
- crypto round-trip tests in [web/src/crypto/stealth.test.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/stealth.test.ts)
- `StealthPay.sol` in both:
    - [contracts/pvm/contracts/StealthPay.sol](/Users/rohan/polkadot-stack-template/contracts/pvm/contracts/StealthPay.sol)
    - [contracts/evm/contracts/StealthPay.sol](/Users/rohan/polkadot-stack-template/contracts/evm/contracts/StealthPay.sol)
- local deploy scripts and deployment wiring
- hidden derivation lab in [web/src/pages/StealthLabPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/StealthLabPage.tsx)
- `RegisterPage` in [web/src/pages/RegisterPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/RegisterPage.tsx)
- `SendPage` in [web/src/pages/SendPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/SendPage.tsx)
- `PrivateWithdrawPage` in [web/src/pages/PrivateWithdrawPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/PrivateWithdrawPage.tsx)
- `ScanPage` in [web/src/pages/ScanPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/ScanPage.tsx)
- `WalletPage` in [web/src/pages/WalletPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/WalletPage.tsx)
- `AdvancedPage` in [web/src/pages/AdvancedPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/AdvancedPage.tsx)
- `StealthPayPoolV1.sol` and `WithdrawVerifier.sol` in both EVM and PVM contract packages
- encrypted sender-to-pool note delivery via Bulletin Chain
- relayed private withdraw flow using a browser-worker prover
- public recovery flow from recovered stealth private keys on `ScanPage`
- Privy-first walletless claim flow, where walletless bearer gifts claim into a recoverable embedded H160 wallet
- QR claim sharing for gift links
- relayer-hosted storage sponsorship for encrypted Bulletin payloads
- relayer-hosted public event indexer endpoints for exact lookup by public identifiers such as commitment, memo hash, and nullifier hash

Current public demo state:

- primary demo URL: `https://web-rouge-one-36.vercel.app`
- primary demo branch: `master` / `codex/browser-demo-stable`
- Dot.li investigation branch: `codex/dotli-host-integration`
- Dot.li URL: `https://stealthpaygift24.dot.li`
- reason for the split: Dot.li P-wallet signing currently stalls on the required `Revive.map_account()` onboarding transaction for unmapped accounts, so the reliable demo path is the normal browser app with extension wallet + Privy

Not implemented yet:

- hidden stealth-to-pool shield-hop fallback
- full migration from hand-built `Revive.call(...)` payloads to the Triangle User Agent demo-style `@polkadot-api/sdk-ink` contract write path
- removal of the relayer's legacy `proofInput` witness fallback handler; the frontend no longer treats sending private witness data to the relayer as an acceptable production path
- full Dot.li production hardening for permissions, P-wallet mapping, and host-compatible contract writes

## Current Implemented Flow

The actual current flow is:

1. Recipient loads or creates a dedicated stealth seed, then derives deterministic spending and viewing keys from that seed plus chain ID.
2. Recipient registers the encoded meta-address on the PVM StealthPay contract with `Revive.call(setMetaAddress)`.
3. Sender looks up the recipient owner’s registered meta-address from the contract.
4. Sender derives a one-time ECDH shared secret locally in the browser from the recipient meta-address.
5. Sender creates a fixed-denomination privacy-pool note:
    - `commitment = Poseidon(scope, nullifier, secret)`
    - `nullifierHash = Poseidon(scope, nullifier)`
6. Sender encrypts one Bulletin delivery payload containing:
    - the note material needed for private withdraw
    - the optional human memo text
7. Sender uploads that encrypted payload to Bulletin Chain and announces only the resulting `memoHash`.
8. Sender submits `announcePrivateDeposit(...)` with:
    - `pool`
    - `commitment`
    - `ephemeralPubKey`
    - `viewTag`
    - `memoHash`
    - `value = 1 UNIT`
9. On Paseo, the primary sender route is now Substrate-origin `Revive.call(...)`.
10. A `MsgValueProbe` showed Paseo exposes `msg.value = Revive.call.value * 1e8`, so the deployed `1 ether` pool should be called with `Revive.call.value = 1e10`.
11. `StealthPay.sol` emits a `schemeId = 2` `Announcement` event and calls `StealthPayPoolV1.deposit(commitment)`.
12. `PrivateWithdrawPage` uses the StealthPay public indexer first for exact deposit and announcement lookup, then falls back to local cache, Blockscout / ETH RPC logs, and bounded runtime-event decoding. It reconstructs the Merkle path, decrypts the delivered pool note, requests a relayer quote, and withdraws privately through the relayer.
13. `ScanPage` remains in the repo as the advanced public recovery flow for the older stealth-address path.

The current claim-link slice on top of that flow now supports two modes:

- `registered` gifts keep the original recipient meta-address model:
    - sender encrypts the pool note to the recipient’s registered private wallet
    - the sender can enter an EVM address, a Substrate extension address, or a DotNS name
    - Substrate addresses are resolved to their `pallet-revive` H160 identity with `ReviveApi.address`
    - DotNS names are resolved read-only through the Paseo DotNS registry/resolver contracts, preferring a configured forward address and falling back to the domain owner
    - if the resolved H160 has no StealthPay meta-address, the frontend treats walletless bearer gift as the primary fallback instead of asking the sender to debug registry state
    - the link carries only routing metadata:
        - pool address
        - recipient owner hint
        - registry address
        - deposit transaction hash
    - the link does **not** carry the private note secret itself
- `bearer` gifts support walletless recipients:
    - sender encrypts the same pool note into a Bulletin envelope with a random gift key
    - the link carries routing metadata, `memoHash`, and the gift key
    - the link is the claim capability until redeemed, so anyone with it can claim
    - the recipient signs in through Privy and claims to the embedded H160 wallet
- both modes still use the same sender-to-pool deposit and relayed private withdrawal architecture
- `Send Gift` builds shareable hash-route links that point to `#/gift`
- registered links carry only routing metadata:
    - pool address
    - recipient owner hint
    - registry address
    - deposit transaction hash
- `Claim` parses those links, preloads the pool and registry addresses, narrows the scan to the linked transaction when possible, and uses a more guided flow:
    - unlock the recipient wallet
    - auto-search the linked gift
    - claim privately through the relayer
- for registered-recipient gifts, the recovery export is optional because the recipient wallet identity can rediscover the encrypted delivery
- for bearer links, `Claim` skips recipient-wallet unlock and uses the Privy embedded wallet as the main claim destination; the device-local encrypted vault remains only as an advanced fallback

The current product-facing shell now presents those working flows as:

- `Wallet` for the private-wallet mental model
- `Send Gift` for the current sender-to-pool flow
- `Claim` for the current private withdraw flow
- `Advanced` for public recovery and template/debug tooling

The current frontend also now uses progressive disclosure on the main StealthPay pages:

- `Send Gift` now also uses a more product-like gift-creation presentation:
    - dedicated hero panel
    - simple send/create/share explanation
    - stronger “gift created” sharing state
- `Send Gift` now treats the claim link as a share artifact rather than only a raw technical output
- shared gift URLs now land on `#/gift`, which acts as the recipient handoff page before entering `#/claim`
- sender-side gift links now use native share when the browser supports it
- the `#/gift` handoff page now adapts to wallet availability: when the current browser cannot see an extension wallet, copy/reopen becomes the primary action and claim/recovery routes stay secondary
- `Send Gift` keeps contracts, transport path, and raw pool note details behind advanced sections
- `Claim` at `#/claim` is now the product-facing gift-opening route
- `PrivateWithdrawPage` at `#/withdraw` remains the advanced technical claim/recovery route
- both share the same underlying protocol, but the consumer route hides more of the technical recovery surface by default
- on the consumer route, browser-extension wallet flow is treated as the default, while alternate wallet modes, destination overrides, and seed-based recovery are progressively disclosed
- when the consumer route cannot see a browser extension wallet, it now switches into an explicit unsupported-environment state with copy/reopen/recovery actions instead of showing dead-end empty selectors
- the consumer route now also uses a gift-opening presentation layer:
    - dedicated hero panel
    - simple three-step explanation
    - more human-facing success state after private claim
- the recipient completion state is now treated as the end of a gift flow, not only the end of a protocol interaction
- the main visible copy is now product-first, even though the same protocol still runs underneath
- claim links now provide the first product-facing shortcut into the private claim flow without exposing the raw technical withdraw page as the main entry point

## Current Wallet Modes

The current repo separates wallet roles instead of presenting every wallet as equivalent:

- `Sender wallet`: the Substrate / P-wallet account used for registration, Bulletin direct upload when authorized, and `Revive.call(...)` sends
- `Private claim wallet`: the Privy embedded H160 wallet used to receive walletless bearer-claim payouts
- `Local Dev Signer`: a development-only fallback for local demos and diagnostics

Important distinction:

- `Pwallet / Host` is intended for host environment use
- Privy is the primary embedded walletless provider; Apillon is not in the current main runtime path
- the Privy wallet can receive claimed funds and expose copy / transfer / provider-managed recovery controls on the Wallet page
- inside Dot.li, Privy should not be assumed available because the product host can block or interrupt the external auth surface; the Dot.li branch experiments with using the connected P-wallet's mapped H160 as the claim destination instead

## Current Key Recovery Model

The current repo no longer uses fresh wallet signatures as the production recovery path for
stealth keys.

The implemented flow is:

- `RegisterPage` creates or imports a dedicated 32-byte stealth seed per `(originSs58, chainId)`
- that seed is stored locally and shown for explicit backup
- `ScanPage` reuses the stored seed or accepts the backed-up seed through manual import

The old wallet-signature-derived approach remains only as a hidden diagnostic path in
`StealthLabPage` because the current `sr25519` signing behavior is not stable enough to recover the
same stealth keys across repeated signing calls.

## Current Chain Interaction Shape

The current frontend now uses a split transport model:

- `viem` over `eth-rpc` for contract reads and balance checks
- `polkadot-api` / PAPI signer submission for:
    - `Revive.map_account()`
    - recipient registration with `Revive.call(setMetaAddress)`
    - Bulletin authorization and payload upload signing
- a Node relayer in [relayer/server.mjs](/Users/rohan/polkadot-stack-template/relayer/server.mjs) for quote, proof-coordinate submit, ciphertext-only Bulletin upload sponsorship, and public event indexing

That distinction matters because the hosted Dot.li environment disallows direct chain access by default. The app already uses the host/PAPI provider where available, but some ETH RPC reads and the hand-built `Revive.call(...)` transaction path still need to be moved behind the host-approved contract flow. The reference direction is the `host-api-example` pattern: request host permissions, use host accounts, perform contract dry-runs through `@polkadot-api/sdk-ink`, then submit the returned transaction with `send().signSubmitAndWatch(...)`.

Current Dot.li blocker:

- unmapped P-wallet accounts must submit `Revive.map_account()` before they can call PVM contracts
- the mapping call appears as call data `0x6407`
- in the hosted product, the signing modal can remain stuck on `Signing...`
- until that is resolved, Dot.li is not the primary demo target

## Current Local Defaults

The local repo defaults are now aligned to:

- Substrate WS: `ws://127.0.0.1:9944`
- Ethereum RPC: `http://127.0.0.1:8545`

## Reading This File

Use the rest of this file as:

- product-direction context
- architectural intent
- stretch-goal planning material

Do not treat every section below as implemented reality. When this file disagrees with the repo, the code and the sections above win.

**Author:** [you]
**Date:** April 22, 2026
**Program:** PBA-X Lisbon 2026 — Polkadot Protocol Builders Program (PBP)
**Backend track:** Solidity smart contract on **PVM** (EVM kept as backup)
**Frontend track:** Static web app (React + TypeScript)
**Mandatory deploy target:** Bulletin Chain + DotNS on **Paseo Asset Hub**
**Build window:** ~3 days, solo, with AI coding tools

---

## 1. One-paragraph summary

StealthPay is a transaction-privacy primitive for Polkadot Hub. A recipient publishes a one-time **meta-address** on-chain. Senders derive a fresh **stealth address** for every payment via ECDH over secp256k1, transfer funds to that fresh address, and emit a public **Announcement** event carrying just enough data for the recipient — and only the recipient — to scan and recognize incoming payments. An optional encrypted memo is stored as a Bulletin Chain blob, retrievable only by the recipient. As a stretch goal, a Tornado-style ZK withdrawal flow lets recipients consolidate funds out of stealth addresses without linking the consolidation to the original payments — a Groth16 proof verified on-chain via PVM's BN128 precompiles.

The narrative for the pitch and retrospective: **"Project Individuality solves identity privacy on Polkadot. StealthPay is the missing transaction-privacy primitive. Together they're what the Polkadot privacy story needs to be complete."**

---

## 2. Why this project, why now

Polkadot in 2026 has a clear privacy-and-identity flagship in **Project Individuality / Proof of Personhood** (Gavin Wood, Referendum 1783, $3M treasury, "fairest airdrop ever"). Identity privacy is well covered. **Transaction privacy is not.** There is no Tornado, Umbra, or Aztec equivalent productionized on Polkadot today. PVM contracts went live on Asset Hub in December 2025 and are exactly the surface area Parity wants stress-tested. The PBP guidelines explicitly reward (a) protocol ports from other ecosystems, (b) Bulletin Chain usage in product logic, (c) high-quality bug reports against rough PVM edges, and (d) projects that "gesture at Parity's broader vision."

StealthPay hits all four.

---

## 3. Goals and non-goals

### 3.1 Goals (must-ship MVP)

- A working PVM smart contract on Paseo Asset Hub that holds meta-addresses, accepts payments to derived stealth addresses, and emits scannable Announcement events.
- A web app deployed on Bulletin Chain, reachable via a DotNS name on Paseo, with three flows: **Register**, **Send**, **Scan**.
- Encrypted memos stored as Bulletin Chain blobs (this is the non-trivial Bulletin Chain usage that §5 of the guidelines rewards).
- Clean README, retrospective, demo dry-run, and meaningful git history.

### 3.2 Stretch goals (try, drop without guilt if running out of time)

- **ZK withdrawal**: a Tornado-style Mixer contract that lets the recipient consolidate funds from N stealth addresses without linking the spend to which addresses, using a Groth16 proof verified via the BN128 precompiles at 0x06/0x07/0x08.
- A short Spend/Withdraw flow in the web app exercising the above.

### 3.3 Non-goals (explicitly out of scope — do not build)

- Multi-token / asset support beyond native PAS — DOT/USDC/etc.
- XCM cross-chain stealth payments. Tempting, kills scope.
- Account abstraction, gasless meta-transactions, paymaster integration.
- A custom Substrate pallet or parachain. Backend is pure Solidity.
- Mobile app or browser extension. Desktop web only.
- A private custom database / subgraph. The frontend now supports an optional Blockscout public-event indexer for faster scans on Paseo, then falls back to `eth_getLogs`, then to runtime-event decoding when the current `Revive.call` path is not indexed into Ethereum logs.
- Migration from / interop with Umbra-on-Ethereum. This is a port, not a bridge.
- Anything on Westend (deprecated by Polkadot — Paseo is the official testnet).
- A "real" SNARK circuit written from scratch. Use snarkjs + an existing Tornado circuit if doing the ZK stretch.

---

## 4. Stack and pinned versions

These are not aspirational — they are exactly what the `polkadot-stack-template` (Shawn Tabrizi) ships with as of `stable2512-3`. **Use these versions or higher; do not downgrade.**

| Layer                     | Component                                    | Version                           | Source                                            |
| ------------------------- | -------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| Runtime                   | polkadot-sdk                                 | stable2512-3 (umbrella v2512.3.3) | `paritytech/polkadot-sdk`                         |
| Runtime                   | pallet-revive                                | v0.12.2                           | inside polkadot-sdk                               |
| Node binary               | polkadot-omni-node                           | v1.21.3                           | polkadot-sdk release                              |
| Node binary               | eth-rpc                                      | v0.12.0                           | polkadot-sdk release                              |
| Compiler                  | solc                                         | 0.8.28                            | standard                                          |
| Compiler                  | resolc                                       | 1.0.0                             | `paritytech/revive`, `@parity/resolc@1.0.0` (npm) |
| Build / test              | Hardhat                                      | ^2.27.0                           | `hardhat` (npm)                                   |
| Build / test              | @parity/hardhat-polkadot                     | latest                            | npm                                               |
| Build / test              | @parity/hardhat-polkadot-resolc              | latest                            | npm                                               |
| Build / test (alt)        | Foundry-Polkadot                             | via `foundryup-polkadot`          | `paritytech/foundry-polkadot`                     |
| Frontend lang             | TypeScript                                   | latest                            | npm                                               |
| Frontend framework        | React                                        | 18.3                              | npm                                               |
| Frontend bundler          | Vite                                         | latest 5.x                        | npm                                               |
| Frontend EVM client       | viem                                         | 2.x                               | npm                                               |
| Frontend Substrate client | PAPI (`polkadot-api`)                        | 1.23.3 (template)                 | npm                                               |
| Crypto (browser)          | @noble/curves                                | latest                            | npm — secp256k1                                   |
| Crypto (browser)          | @noble/hashes                                | latest                            | npm — keccak256, sha256                           |
| Crypto (browser)          | @noble/ciphers                               | latest                            | npm — XChaCha20-Poly1305 for memos                |
| ZK (stretch)              | circom                                       | 2.x                               | github.com/iden3/circom                           |
| ZK (stretch)              | snarkjs                                      | latest                            | npm                                               |
| Wallet                    | MetaMask (EVM)                               | ext                               | for Polkadot Hub EVM-style accounts               |
| Wallet (alt)              | Polkadot.js extension / Talisman / SubWallet | ext                               | for Substrate-style accounts                      |
| Node version              | Node.js                                      | 22.x LTS, npm 10.9.0+             | nvm                                               |

### 4.1 Networks

| Network                      | Type             | Endpoint                                                |
| ---------------------------- | ---------------- | ------------------------------------------------------- |
| Paseo Asset Hub (Passet Hub) | Testnet, ETH-RPC | `https://testnet-passet-hub-eth-rpc.polkadot.io`        |
| Local dev node               | Substrate WS     | `ws://127.0.0.1:9944`                                   |
| Local dev node               | ETH-RPC          | `http://127.0.0.1:8545`                                 |
| Faucets                      | PAS              | `https://faucet.polkadot.io/`, `https://faucet.dot.li/` |
| Block explorer               | Blockscout       | `https://blockscout-testnet.polkadot.io/`               |

---

## 5. Architecture

### 5.1 System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React + Vite)                        │
│                                                                      │
│  Register Page          Send Page             Scan Page              │
│  - generate (s,S,v,V)   - lookup recipient    - fetch Announcements  │
│  - sign register tx     - derive stealth      - filter by viewTag    │
│                         - encrypt memo        - decrypt memo         │
│                         - send + announce     - derive spend keys    │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Crypto layer:  @noble/curves (secp256k1)                      │  │
│  │                @noble/hashes  (keccak256, sha256)             │  │
│  │                @noble/ciphers (XChaCha20-Poly1305 for memos)  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────┐  ┌────────────────────┐  ┌──────────────────┐ │
│  │ viem (eth-rpc)   │  │ PAPI (substrate)   │  │ Wallet adapter   │ │
│  │ - read events    │  │ - upload bulletin  │  │ - MetaMask       │ │
│  │ - call contract  │  │   blobs            │  │   (EVM-style)    │ │
│  │ - send txs       │  │ - read bulletin    │  │                  │ │
│  └────────┬─────────┘  └──────────┬─────────┘  └──────────────────┘ │
└───────────┼──────────────────────────┼──────────────────────────────┘
            │                          │
            │ JSON-RPC (8545)          │ Substrate WS
            │                          │
   ┌────────▼──────────┐    ┌──────────▼──────────────┐
   │  Paseo Asset Hub  │    │  Polkadot Bulletin Chain │
   │  (Passet Hub)     │    │  on Paseo                 │
   │                   │    │                           │
   │  pallet-revive    │    │  ~2-week blob retention   │
   │   StealthPay.sol  │    │  Stores encrypted memos   │
   │  (deployed via    │    │                           │
   │   Hardhat)        │    │  Plus: web app static     │
   │                   │    │  files (HTML/JS/CSS)      │
   └────────┬──────────┘    └──────────┬────────────────┘
            │                          │
            │                          │ DotNS resolution
            │                          ▼
            │              ┌────────────────────────┐
            │              │  stealthpay-XX.paseo.li│
            │              │  (your DotNS name)     │
            │              └────────────────────────┘
            │
   ┌────────▼─────────────────────────────────────────┐
   │  PVM precompiles (used as-is, no install needed) │
   │   0x01 ECRECOVER     ── signature recovery       │
   │   0x02 SHA256                                    │
   │   0x05 ModExp                                    │
   │   0x06 BN128Add      ── Groth16 stretch only     │
   │   0x07 BN128Mul      ── Groth16 stretch only     │
   │   0x08 BN128Pairing  ── Groth16 stretch only     │
   └──────────────────────────────────────────────────┘
```

### 5.2 Why this shape

- **Single Solidity contract on PVM**, not a custom pallet. The PBP guidelines §3.1 accept "Solidity smart contract on PVM" as a backend; a custom pallet would force a parachain runtime which doubles the moving parts.
- **viem for reads/writes via eth-rpc**, not subxt or PAPI for the contract calls. PVM is exposed through an EVM-compatible JSON-RPC adapter (`eth-rpc` v0.12.0). This means MetaMask works, viem works, ethers.js works — no special client needed for contracts. PAPI is only used for Bulletin Chain interactions (which are Substrate-native, not EVM).
- **Browser-side crypto via @noble/curves**, not subtle-crypto or in-contract derivation. The secp256k1 ECDH derivation must happen client-side (recipient's view-key never leaves their device). `@noble/curves` is the audited pure-JS standard.
- **Bulletin Chain for memos**, not on-chain storage. Memos can be arbitrary length and Bulletin Chain's ~2-week retention is fine for the "claim within window" UX. Storing memos in contract storage would be expensive and limit memo size.
- **Optional public-event indexer, no private database.** On Paseo, the frontend can use Blockscout's address log API first for public `Announcement` and pool `Deposit` events. If that is unavailable, it falls back to `eth_getLogs` for the last N blocks, and then to decoding recent `Revive.ContractEmitted` runtime events directly from Substrate state. The indexer path never stores gift keys, decrypted notes, recipient mappings, or private wallet secrets.

---

## 6. Cryptographic design

The protocol is the standard stealth-address scheme used by Umbra on Ethereum (ERC-5564 family), adapted to Polkadot Hub's EVM-style accounts (which already use secp256k1).

### 6.1 Notation

- All curve operations are on **secp256k1**. `G` is the standard generator. `n` is the curve order.
- `keccak256` is the standard 256-bit Keccak hash (the same one Ethereum uses; available on PVM as opcode `KECCAK256`, also in `@noble/hashes`).
- `||` denotes byte concatenation.
- `[i:j]` denotes byte-slice from index `i` (inclusive) to `j` (exclusive).
- A 20-byte EVM-style address derived from a public key `P` is `addr(P) = keccak256(P)[12:32]` where `P` is the uncompressed public key without the `0x04` prefix.

### 6.2 Key generation (recipient, browser-side, one-time)

Recipient generates two independent keypairs:

```
s  ←$ {1, ..., n-1}      // spending private key
S  =  s · G              // spending public key

v  ←$ {1, ..., n-1}      // viewing private key
V  =  v · G              // viewing public key
```

The **meta-address** is the public pair `(S, V)`, encoded as `bytes` (33-byte compressed each, total 66 bytes). Both private keys (`s`, `v`) are stored in browser localStorage encrypted with the wallet-signed message (or kept ephemeral and re-derived from a signature deterministically — see §6.6 for an option).

### 6.3 Sending (sender, browser-side, per payment)

Given recipient's public meta-address `(S, V)` and amount `value`:

```
r  ←$ {1, ..., n-1}      // ephemeral private key (single-use, discarded after)
R  =  r · G              // ephemeral public key (broadcast on-chain)

Q       =  r · V                            // shared secret point
shared  =  keccak256(serialize_compressed(Q))   // 32-byte shared secret

P_stealth  =  S + shared · G                // stealth public key
addr_stealth = addr(P_stealth)              // 20-byte EVM address

view_tag  =  shared[0]                      // 1 byte for fast scan filter
```

The sender then submits a single transaction calling `StealthPay.announceAndPay(addr_stealth, R, view_tag, memoHash)` with `msg.value = value`. The contract forwards `msg.value` to `addr_stealth` and emits the `Announcement` event.

### 6.4 Memo encryption (sender, optional)

If the sender attaches a memo `m`:

```
nonce       ←$ 24 random bytes                       // XChaCha20 nonce
ciphertext  =  XChaCha20-Poly1305(key=shared, nonce=nonce, plaintext=m)
blob        =  nonce || ciphertext
```

`blob` is uploaded to Bulletin Chain via PAPI (see §8). Its content-address `memoHash = blake2_256(blob)` is included in the Announcement. The recipient retrieves the blob by `memoHash`, recovers `nonce` from the first 24 bytes, and decrypts using their re-derived `shared`.

### 6.5 Scanning (recipient, browser-side, on demand)

For each `Announcement(stealth_address, R, view_tag, memoHash)` in the recent history:

```
Q'      =  v · R
shared' =  keccak256(serialize_compressed(Q'))

if shared'[0] != view_tag:
    skip                                      // 1-byte rejection — ~99.6% of unrelated events skipped here

P'      =  S + shared' · G
if addr(P') != stealth_address:
    skip                                      // ~256× extra rejection for the false positives that survive

// match — this payment is for me
spending_priv_key_for_this_address = (s + shared') mod n
```

The recipient now holds the private key for `stealth_address` and can transfer funds out of it. The view tag turns scanning a million announcements into ~4000 full ECC operations — cheap enough for a browser session.

### 6.6 Optional: deterministic key generation from wallet signature

This section is product-direction context from the imported PRD. It is not the current repo
implementation.

The actual repo moved away from this for production Register / Scan flows after confirming that the
current `sr25519` signer path does not reproduce the same signature on repeated calls.

Rather than ask users to back up `(s, v)`, derive both deterministically from a wallet signature on a fixed message. This way, anyone who controls the wallet can re-derive their stealth keys on a fresh device:

```
sig          =  wallet.signMessage("StealthPay v1: stealth keys for " || chainId)
seed_buffer  =  keccak256(sig)
s            =  to_scalar(keccak256(seed_buffer || "spending"))
v            =  to_scalar(keccak256(seed_buffer || "viewing"))
```

This pattern is well-established (Umbra uses it, Skiff used it) and preferred for UX. **Document the security implication clearly**: anyone who can produce that signature can recover the stealth keys, which is the same trust model as the wallet itself.

### 6.7 What this protocol does NOT do (be honest in the README)

- It does not hide the **amount** of each payment. That's range-proof / Bulletproof territory, well out of scope.
- It does not break the link from sender to stealth address — anyone can see `sender → stealth_address`. The unlinkability is `stealth_address ↛ recipient`. This is the same property Umbra has. The ZK stretch in §10 fixes the converse on the spend side.
- It is not resistant to a global passive observer who can correlate timing or amounts.
- Without per-payment gas funding (paymasters), the gas itself for `Announcement` is paid by the sender in the clear. Acceptable for v1; document.

---

## 7. Smart contract design

### 7.1 Single contract surface

Combine registry + announcer in one contract — they share storage layout intuitions and reduce gas overhead:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title StealthPay
/// @notice Stealth-address registry and payment announcer for Polkadot Hub.
/// @dev Designed for pallet-revive on PVM. EVM-compatible via REVM.
contract StealthPay {

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    /// Encoded as: bytes33(spendingPubKey_compressed) || bytes33(viewingPubKey_compressed)
    /// 0 length means "no meta-address registered"
    mapping(address => bytes) public metaAddressOf;

    /// Monotonic counter so off-chain tools can paginate without timestamp ambiguity
    uint256 public announcementCount;

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    /// Emitted once per meta-address registration / update.
    event MetaAddressSet(
        address indexed owner,
        bytes spendingPubKey,    // 33 bytes compressed secp256k1
        bytes viewingPubKey      // 33 bytes compressed secp256k1
    );

    /// Emitted once per stealth payment.
    /// `stealthAddress` is intentionally NOT indexed to prevent address-watching.
    /// `sender` is indexed because it's already public from tx.origin anyway.
    /// `viewTag` is uint8 to keep ABI cheap; only the first byte of `shared` is used.
    event Announcement(
        uint256 indexed schemeId,        // for protocol versioning; v1 = 1
        address sender,
        address stealthAddress,
        bytes ephemeralPubKey,           // 33 bytes compressed secp256k1
        uint8 viewTag,
        bytes32 memoHash,                // blake2_256(memo blob in Bulletin Chain), or zero
        uint256 nonce                    // = announcementCount at emit time
    );

    // ─────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────

    error InvalidPubKeyLength();
    error EmptyTransfer();
    error TransferFailed();

    // ─────────────────────────────────────────────────────────────
    // Registration
    // ─────────────────────────────────────────────────────────────

    /// @notice Register or replace your meta-address.
    /// @dev Compressed-form pubkeys must be 33 bytes each.
    function setMetaAddress(
        bytes calldata spendingPubKey,
        bytes calldata viewingPubKey
    ) external {
        if (spendingPubKey.length != 33 || viewingPubKey.length != 33) {
            revert InvalidPubKeyLength();
        }
        metaAddressOf[msg.sender] = abi.encodePacked(spendingPubKey, viewingPubKey);
        emit MetaAddressSet(msg.sender, spendingPubKey, viewingPubKey);
    }

    /// @notice Remove your meta-address. Past Announcements remain on-chain.
    function clearMetaAddress() external {
        delete metaAddressOf[msg.sender];
        emit MetaAddressSet(msg.sender, "", "");
    }

    // ─────────────────────────────────────────────────────────────
    // Payment + announcement
    // ─────────────────────────────────────────────────────────────

    /// @notice Transfer `msg.value` to `stealthAddress` and emit an Announcement.
    /// @dev The sender computed `stealthAddress` off-chain via stealth derivation.
    function announceAndPay(
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        uint8 viewTag,
        bytes32 memoHash
    ) external payable {
        if (msg.value == 0) revert EmptyTransfer();
        if (ephemeralPubKey.length != 33) revert InvalidPubKeyLength();

        unchecked { announcementCount++; }
        uint256 nonce = announcementCount;

        emit Announcement(
            1,                       // schemeId v1
            msg.sender,
            stealthAddress,
            ephemeralPubKey,
            viewTag,
            memoHash,
            nonce
        );

        // Forward funds. Use call rather than transfer/send to avoid 2300-gas trap.
        (bool ok, ) = stealthAddress.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
    }

    // ─────────────────────────────────────────────────────────────
    // Reads (convenience for frontend; logs are still source of truth)
    // ─────────────────────────────────────────────────────────────

    /// @notice Whether `who` has a registered meta-address.
    function hasMetaAddress(address who) external view returns (bool) {
        return metaAddressOf[who].length == 66;
    }
}
```

### 7.2 PVM-specific notes (important — don't ignore)

- **Stack and heap are fixed-size on PVM**, unlike EVM where the heap grows with gas. Contracts that compile fine for EVM may trap on PVM due to stack-depth or heap-size issues. Keep functions shallow; avoid deeply-nested struct copies. The contract above is intentionally flat.
- **63/64 gas rule is not implemented** in pallet-revive. Cross-contract calls don't reserve gas the same way as EVM. The contract above only does one external call (the value transfer), so this doesn't bite us in v1, but flag it for the ZK stretch where the verifier contract calls into precompiles.
- **Contracts are deployed by hash**, not by code, in pallet-revive. This is invisible at the Solidity layer when using the EVM-compatible deployment path through `eth-rpc`, but matters if you start poking at lower levels.
- **`address.transfer` and `address.send` are 2300-gas-stipend patterns** that may not behave identically. Use `.call{value: x}("")` (which the contract above does).
- The **`payable` modifier and `msg.value` work as expected** through the REVM/eth-rpc compatibility layer.
- **Foundry helpers like `vm.warp`, `loadFixture`, `time.increase` may not be supported** when targeting a PVM node. Plain ethers.js / viem patterns work; cheat-code-style helpers don't. Plan tests around real time, not simulated time.

### 7.3 Why this shape and not a custom pallet

- Faster ship time (Solidity + Hardhat path is mature; pallet path requires runtime upgrades).
- Anyone with a MetaMask wallet can use it — no Substrate-native wallet required.
- The `stealthAddress` receiving funds is just an EVM-style address with no on-chain state until used; `eth-rpc` adapter handles the existential-deposit-style account creation transparently for PVM.
- The PBP guidelines §3.1 accept Solidity-on-PVM as a valid backend; §4 puts it at ~70% confidence to ship.

---

## 8. Bulletin Chain integration (memos)

This is the §5 "sensible use of Bulletin Chain in product logic" credit, not just hosting.

### 8.1 Why Bulletin Chain instead of contract storage

- Memos are arbitrary length (a 2KB note vs. a $500 storage-deposit blob in contract storage).
- Memos are ephemeral by nature — recipient claims within ~2 weeks. Bulletin Chain's retention window is the right fit; permanent storage would be wasteful.
- Storing ciphertext on Bulletin Chain keeps the on-chain footprint small (just a 32-byte content hash).

### 8.2 Flow

**Sender (after computing `shared` and ciphertext):**

1. Authorize a Bulletin Chain account once via `Faucet → Authorize Account` on the Bulletin Paseo UI (`https://paritytech.github.io/polkadot-bulletin-chain/`). This grants temporary upload allowance.
2. Use PAPI to call `bulletin.upload(blob)` (the actual extrinsic name is in `paritytech/polkadot-bulletin-chain/examples/`; verify against current code rather than memorizing).
3. Retrieve the assigned `memoHash` (blake2_256 of the blob, computed by the chain).
4. Pass `memoHash` into the contract's `announceAndPay`.

**Recipient (during scan):**

1. After matching an Announcement and deriving `shared`, fetch the Bulletin blob by `memoHash` via PAPI (`bulletin.fetch(hash)` or the equivalent).
2. Strip the first 24 bytes as the XChaCha20 nonce.
3. Decrypt using `shared` as the key.
4. Display the memo.

### 8.3 What to do if Bulletin Chain authorization is hard / slow

If Bulletin Chain proves to be a Day-1 timesink:

- Ship without memos for the MVP — the protocol works fine without them.
- Document in retrospective: "Tried Bulletin integration, hit X, fell back to in-contract memos for the demo, here's the bug report I filed."
- This _is_ a legitimate deliverable per the PBP guidelines.

---

## 9. DotNS / Bulletin web hosting deploy

The web app must be reachable at a `*.paseo.li` URL. This is the Bulletin-Chain-as-hosting path that the polkadot-stack-template uses and that `bulletin-deploy` v0.7.0 automates.

### 9.1 Build & upload

The standard pipeline (mirroring what the template's CI workflow does):

1. `cd web && npm run build` — produces `web/dist/` static bundle.
2. `bulletin-deploy upload web/dist/ --network paseo` — uploads the directory as a Bulletin Chain blob (or set of blobs), returns a content hash.
3. `bulletin-deploy register stealthpay-XX.paseo.li --hash <content-hash>` — registers the DotNS name pointing at the content hash.

(Verify exact CLI surface against `bulletin-deploy` v0.7.0 release notes — versions move; the conceptual flow is: build → upload blob → register name → name resolves to blob via DotNS lookup. Also note the user's prompt mentioned: "pick a name like `my-product-90` longer name with 2 numbers in the end" — follow that hint.)

### 9.2 What dotli.dev / dot.li RPC fallback means

The user's notes mention that `dotli.dev` is an RPC fallback if `dot.li` is "crapping out." Treat both as resolution endpoints — your end users may need to try the `.dotli.dev` mirror if `.paseo.li` is flaky on demo day. Test both during the dry-run.

### 9.3 Pitch-day risk mitigation

- Test the DotNS URL **from a fresh browser session** (not the one you've been developing in) at end-of-day-2.
- Have a `localhost` fallback ready that runs the same web app against the same deployed contract, in case DotNS resolution flakes during the live demo.
- Include the deployed contract address in the README so reviewers can poke at it directly via Blockscout if your URL is down.

---

## 10. ZK stretch goal — Tornado-style anonymous withdrawal

The ZK stretch turns StealthPay from "unlinkable receipt" into "unlinkable receipt and unlinkable spend." Ship this only after the MVP is fully working.

### 10.1 The added problem

After a recipient receives N stealth payments to N different stealth addresses, they hold N different private keys. To consolidate funds, the naive flow is to send from each stealth address to a single "main" address — but this on-chain flow visibly clusters all N stealth addresses to that main address, defeating much of the privacy.

### 10.2 The Tornado pattern

- Recipient deposits each received payment into a `Mixer` contract together with a **commitment** `c = poseidon_hash(nullifier, secret)` where `(nullifier, secret)` are random scalars known only to the recipient.
- All commitments accumulate into an on-chain Merkle tree.
- Later, recipient withdraws by submitting a Groth16 proof that proves: _"I know `(nullifier, secret)` such that `poseidon_hash(nullifier, secret)` is in the Merkle tree with root R, and here is `nullifier_hash = poseidon_hash(nullifier)` to prevent double-spend."_
- The `Mixer` contract verifies the SNARK using BN128 precompiles and pays out to a fresh address provided in the proof's public inputs.

### 10.3 Why it works on PVM (the critical de-risk)

PVM/Polkadot Hub exposes the EVM's elliptic-curve precompiles at the standard addresses, **explicitly documented in the official Polkadot docs**:

| Address | Precompile                                 | EIP     |
| ------- | ------------------------------------------ | ------- |
| `0x06`  | BN128Add (alt_bn128 point addition)        | EIP-196 |
| `0x07`  | BN128Mul (alt_bn128 scalar multiplication) | EIP-196 |
| `0x08`  | BN128Pairing (alt_bn128 pairing check)     | EIP-197 |

These are exactly the precompiles that snarkjs's auto-generated Groth16 verifier contracts use. **A snarkjs `Verifier.sol` should compile via resolc with no source changes.** This is the strongest single fact in the whole project — it converts the ZK stretch from "speculative" to "should work, will know in an hour of trying."

### 10.4 Off-the-shelf circuit choice

Do not write a circuit from scratch. Use one of:

- The Tornado Cash core circuit (`tornado-core/circuits/withdraw.circom`) — well-trodden, audited, exactly the right shape.
- Semaphore (`semaphore-protocol`'s `semaphore.circom`) — slightly more general, also fine.

Either way: clone, point at a small Merkle tree depth (e.g., 16 levels = 65k slots, more than enough for a demo), run the ceremony with an existing Powers of Tau file, and let snarkjs spit out:

- `circuit_final.zkey` (proving key for browser)
- `Verifier.sol` (Groth16 verifier for PVM, calls into 0x06/0x07/0x08)

### 10.5 The honest failure mode

If the BN128 precompiles **don't behave identically** to Ethereum's (e.g., different gas semantics, different return-data encoding, an off-by-one in the pairing precompile output), the Verifier.sol may compile but revert at runtime. **This is exactly the bug report the PBP guidelines value highest.** If the ZK stretch fails this way:

1. Stop trying to make it work.
2. File a precise issue against `paritytech/polkadot-sdk` (substrate/frame/revive subdir) with a minimal repro: a 50-line Solidity contract that calls 0x08 with known-good inputs and expects known-good outputs, showing the divergence from EVM.
3. Document this in your retrospective as a stack improvement.

That bug report is worth as much as a working ZK feature, per §1 of the project guidelines. Plan for it.

---

## 11. Risks and mitigations

| #   | Risk                                                                                                             | Likelihood | Impact                         | Mitigation                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | resolc compilation fails on stealth contract                                                                     | Low        | High                           | Contract is intentionally minimal & flat; use `polkadot-stack-template` contracts dir as known-working starting point                  |
| 2   | BN128 precompiles diverge from EVM behavior on PVM                                                               | Medium     | Medium (kills ZK stretch only) | Detect early with a 30-LOC sanity contract on day 3 morning; cut ZK if it fails; turn the divergence into a bug report                 |
| 3   | Bulletin Chain authorization slow / rate-limited                                                                 | Medium     | Low                            | Fall back to in-contract memos for v1; document in retrospective                                                                       |
| 4   | DotNS resolution flakes on demo day                                                                              | Medium     | Medium                         | Localhost fallback + Blockscout direct contract link; test from fresh browser session                                                  |
| 5   | secp256k1 ECDH derivation off-by-one across browser ↔ contract                                                   | Medium     | High                           | Round-trip test on Day 1: register → send → scan loop must work end-to-end before moving on                                            |
| 6   | MetaMask doesn't connect to Passet Hub correctly                                                                 | Low        | High                           | Use exact RPC URL `https://testnet-passet-hub-eth-rpc.polkadot.io` from Polkadot docs; chain-id from `eth_chainId` once added          |
| 7   | Existential deposit problem: stealth address can't receive funds because account doesn't exist on Substrate side | Low–Medium | Medium                         | Test in Day 1 with a tiny send to a fresh address; if it traps, look at how the polkadot-stack-template's `eth-rpc` adapter handles it |
| 8   | Insufficient PAS for testing                                                                                     | Low        | Low                            | Faucet + ask faculty (the user's notes mention this is available)                                                                      |
| 9   | resolc bug specific to stealth contract pattern                                                                  | Low        | High                           | Have EVM as backup target — `revm` is mature; can flip `polkavm: true` → `false` in hardhat.config                                     |
| 10  | Run out of time on Day 3 polish                                                                                  | Medium     | Medium                         | Drop ZK stretch first, then drop Bulletin Chain memos, then cut Spend page from MVP — Register/Send/Scan is the demo-able core         |

---

## 12. Implementation plan (3 days)

This is the cuttable, prioritized plan. The MVP is **Days 1+2**. Day 3 is polish, deploy, ZK stretch, retrospective.

### 12.1 Day 0 (right now, before sleep)

- Fork `shawntabrizi/polkadot-stack-template`. Run `./scripts/start-all.sh` end-to-end. Confirm a contract deploys to the local node and the React app talks to it.
- Get a MetaMask account funded with PAS from the faucet.
- Successfully deploy the template's PoE contract to Passet Hub (`https://testnet-passet-hub-eth-rpc.polkadot.io`) and call it from the local web app pointed at the testnet. **This is the smoke test that proves your toolchain is sound.** Do not proceed to Day 1 until this works.

### 12.2 Day 1 — Crypto + contract

**Morning (4h):**

- Strip the PoE pallet/contract/web pages from the template fork. Keep the scaffold.
- Write `web/src/crypto/stealth.ts` — pure crypto module, ~150 LOC: `generateMetaAddress`, `deriveStealthAddress`, `scanAnnouncement`, `deriveSpendingKey`. Use `@noble/curves/secp256k1` and `@noble/hashes/keccak256`.
- Write `crypto.test.ts` round-trip tests in plain TS: "register → send → scan recovers the right address and the right spend key." **Get this green before touching Solidity.** This is the lynchpin; if this is right, everything downstream is right.

**Afternoon (4h):**

- Write `contracts/pvm/StealthPay.sol` per §7.1. Compile with resolc via Hardhat.
- Write `contracts/pvm/test/StealthPay.test.ts` — three Hardhat tests: register, announce-and-pay forwards funds, replaying with wrong inputs reverts. Use plain ethers.js patterns (no `loadFixture`, no `time.increase`).
- Deploy locally. Then deploy to Passet Hub via `npx hardhat ignition deploy ./ignition/modules/StealthPay.ts --network passetHub`. Note the deployed address.

**Evening (2h):**

- Wire up MetaMask → contract via viem. Build a stripped-down test page that calls `setMetaAddress` and `announceAndPay` with hardcoded data. Confirm an event lands and is visible in Blockscout.

### 12.3 Day 2 — UX + scan + Bulletin

**Morning (4h):**

- Build `RegisterPage`: done. It now uses a dedicated stored/importable stealth seed instead of the §6.6 signature-derived approach.
- Build `SendPage`: input recipient address, fetch their meta-address from the contract, derive stealth address via `stealth.ts`, show a preview, send via viem.

**Afternoon (4h):**

- Build `ScanPage`: done. It fetches logs via viem when available and falls back to recent `Revive.ContractEmitted` runtime events locally, using the same stored/imported stealth seed as registration.
- Build encrypted memo flow: done for text memos only. `SendPage` uploads encrypted memo envelopes to Bulletin Chain, and `ScanPage` fetches and decrypts them from `memoHash`.
- End-to-end test in browser: A registers → B sends → A sees the receipt with correct spend key.

**Evening (2h):**

- Add Bulletin Chain memo path. Encrypt memo via `@noble/ciphers`, upload via PAPI, include `memoHash` in announcement. On scan side, fetch + decrypt + display memo.
- If Bulletin authorization is fighting you, defer to Day 3 morning and proceed to UI polish.

### 12.4 Day 3 — Deploy, ZK stretch, retrospective

**Morning (3h):**

- Smoke-test BN128 precompile on PVM: write a 30-LOC test contract that calls 0x06/0x07/0x08 with EIP-197 test vectors. **If it works**, proceed with ZK stretch. **If it returns wrong data**, file a polkadot-sdk issue with the repro and skip the rest of the stretch. Do not spend more than 90 minutes finding out.
- (If stretch surviving) Clone Tornado Cash circuits, run snarkjs through `groth16 setup` → `groth16 export solidityverifier` to produce `Verifier.sol`. Compile it with resolc.

**Afternoon (4h):**

- (If stretch surviving) Write `Mixer.sol` that exposes `deposit(commitment)` and `withdraw(proof, root, nullifierHash, recipient)`, calls into the `Verifier` for proof check, and tracks nullifiers. Deploy.
- (If stretch surviving) Add a Spend page that lets the user deposit a received stealth payment and withdraw to a fresh address, generating proofs in the browser via `snarkjs.groth16.fullProve`.
- Build prod web bundle: `npm run build`.
- Deploy to Bulletin Chain + DotNS with `bulletin-deploy` v0.7.0. Get `stealthpay-XX.paseo.li` resolving.

**Evening (3h):**

- Write the README per §13 below. Make it 90% you, 10% AI per the program's "no slop" rule.
- Fill out the retrospective using the template at `pba-content/projects/retrospective-template.md`.
- Live demo dry-run from a fresh browser session against the deployed Passet Hub contract via the deployed DotNS URL.
- Record a backup demo video in case live flakes on pitch day.
- Final commit + push. Tag a release.

---

## 13. Repository structure

Mirror the polkadot-stack-template layout — reviewers will recognize it instantly and that's good signal.

```
stealthpay/
├── .github/workflows/         # CI: build + test + deploy-to-bulletin
├── contracts/
│   └── pvm/
│       ├── contracts/
│       │   ├── StealthPay.sol           # core contract (§7)
│       │   ├── Mixer.sol                # ZK stretch
│       │   └── Verifier.sol             # snarkjs-generated, do not edit
│       ├── ignition/
│       │   └── modules/
│       │       ├── StealthPay.ts        # deployment module
│       │       └── Mixer.ts             # ZK stretch
│       ├── test/
│       │   └── StealthPay.test.ts
│       ├── hardhat.config.ts            # @parity/hardhat-polkadot config
│       └── package.json
├── circuits/                  # ZK stretch only; checked-in artifacts
│   ├── withdraw.circom        # from tornado-core
│   ├── withdraw_final.zkey    # generated
│   └── verification_key.json  # generated
├── web/
│   ├── src/
│   │   ├── crypto/
│   │   │   ├── stealth.ts     # secp256k1 derivation (§6)
│   │   │   ├── memo.ts        # XChaCha20 encrypt/decrypt
│   │   │   └── stealth.test.ts
│   │   ├── chain/
│   │   │   ├── viem.ts        # viem client + contract ABI hooks
│   │   │   └── bulletin.ts    # PAPI client for Bulletin Chain
│   │   ├── pages/
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── SendPage.tsx
│   │   │   ├── ScanPage.tsx
│   │   │   └── SpendPage.tsx  # ZK stretch
│   │   ├── components/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── package.json           # vite + react + viem + papi + @noble/*
│   └── vite.config.ts
├── docs/
│   ├── ARCHITECTURE.md        # this PRD, trimmed
│   ├── CRYPTO.md              # §6 expanded
│   ├── DEPLOYMENT.md          # how to deploy contract + bulletin upload
│   └── BUG_REPORTS.md         # any issues filed against polkadot-sdk during build
├── retrospective.md           # per pba-content template
├── README.md
└── deployments.json           # contract addresses per network
```

---

## 14. Resource links — verified, with version pins

### 14.1 Starting point (mandatory)

- **Stack template**: https://github.com/shawntabrizi/polkadot-stack-template — fork this. Has working PVM contract path, Hardhat config, web scaffold, Bulletin integration, DotNS deploy workflow, and pinned Key Versions table.
- **Project guidelines**: `pba-content/projects/project-guidelines.md` (your repo)
- **Idea bank**: `pba-content/projects/ideas.md` (your repo)
- **Retrospective template**: `pba-content/projects/retrospective-template.md` (your repo)

### 14.2 Polkadot SDK and runtime

- polkadot-sdk monorepo: https://github.com/paritytech/polkadot-sdk
- pallet-revive (smart contracts): under `substrate/frame/revive/` in polkadot-sdk
- polkadot-omni-node binary: from polkadot-sdk releases, tag `polkadot-stable2512-3`
- Polkadot SDK docs: https://docs.polkadot.com/
- Polkadot Wiki — smart contracts: https://wiki.polkadot.com/learn/learn-smart-contracts/

### 14.3 Solidity → PVM toolchain

- **Revive compiler**: https://github.com/paritytech/revive — `resolc` v1.0.0
- **@parity/hardhat-polkadot**: https://www.npmjs.com/package/@parity/hardhat-polkadot
- **@parity/hardhat-polkadot-resolc**: https://www.npmjs.com/package/@parity/hardhat-polkadot-resolc
- **Hardhat docs for Polkadot**: https://docs.polkadot.com/smart-contracts/dev-environments/hardhat/
- **Test & Deploy walkthrough**: https://docs.polkadot.com/tutorials/smart-contracts/launch-your-first-project/test-and-deploy-with-hardhat/
- **EVM vs PVM differences (READ THIS)**: https://docs.polkadot.com/smart-contracts/for-eth-devs/evm-vs-pvm/
- **Smart-contracts devcontainer (alternative; one-command setup)**: https://github.com/paritytech/smart-contracts-devcontainer
- **Foundry-Polkadot**: install via `foundryup-polkadot`, see `paritytech/foundry-polkadot`

### 14.4 PVM precompiles

- **Official precompile reference (CONFIRMS BN128)**: https://docs.polkadot.com/develop/smart-contracts/precompiles/interact-with-precompiles/
- EIP-196 (BN128 add/mul): https://eips.ethereum.org/EIPS/eip-196
- EIP-197 (BN128 pairing): https://eips.ethereum.org/EIPS/eip-197

### 14.5 Frontend libraries

- viem: https://viem.sh/ (use 2.x)
- PAPI (`polkadot-api`): https://papi.how/ (template uses 1.23.3)
- @noble/curves: https://github.com/paulmillr/noble-curves
- @noble/hashes: https://github.com/paulmillr/noble-hashes
- @noble/ciphers: https://github.com/paulmillr/noble-ciphers

### 14.6 Bulletin Chain & DotNS

- polkadot-bulletin-chain: https://github.com/paritytech/polkadot-bulletin-chain — see `examples/` for upload patterns (PJS and PAPI)
- Bulletin Authorization UI: https://paritytech.github.io/polkadot-bulletin-chain/ → Faucet → Authorize Account
- DotNS link shortener: https://dot.li/ (and `dotli.dev` fallback)
- bulletin-deploy v0.7.0: https://github.com/paritytech/bulletin-deploy/releases/tag/v0.7.0 — verify exact CLI surface against the release notes

### 14.7 Networks, faucets, explorers

- **Paseo / Passet Hub ETH-RPC**: `https://testnet-passet-hub-eth-rpc.polkadot.io`
- Paseo network: https://paseo.network/
- Polkadot Faucet: https://faucet.polkadot.io/
- DotLi Faucet: https://faucet.dot.li/
- **Blockscout (testnet)**: https://blockscout-testnet.polkadot.io/

### 14.8 ZK tooling (stretch only)

- circom 2: https://github.com/iden3/circom
- snarkjs: https://github.com/iden3/snarkjs
- Tornado Cash core circuits (reference, MIT-licensed): https://github.com/tornadocash/tornado-core
- Semaphore (alternative pattern): https://semaphore.pse.dev/

### 14.9 Reference protocols this is adapting

- Umbra Protocol (Ethereum, the original stealth-payments product): https://app.umbra.cash/
- ERC-5564 (stealth-address standard): https://eips.ethereum.org/EIPS/eip-5564
- ERC-6538 (stealth-meta-address registry): https://eips.ethereum.org/EIPS/eip-6538

### 14.10 The ecosystem narrative this is positioned against

- Polkadot Roundup 2025 (Gavin Wood): https://medium.com/polkadot-network/polkadot-roundup-2025-3c3c71c7e9c4
- Project Individuality / Proof of Personhood: https://www.proofofpersonhood.how/
- What is Polkadot Hub: https://www.parity.io/blog/what-is-polkadot-hub
- Revive status update (forum): https://forum.polkadot.network/t/revive-smart-contracts-status-update/16366

### 14.11 Where to file bug reports (these are deliverables)

- polkadot-sdk issues (use labels `T7-smart_contracts`, `C2-good-first-issue` if applicable): https://github.com/paritytech/polkadot-sdk/issues
- revive (resolc compiler): https://github.com/paritytech/revive/issues
- bulletin-chain: https://github.com/paritytech/polkadot-bulletin-chain/issues
- bulletin-deploy: https://github.com/paritytech/bulletin-deploy/issues
- polkadot-stack-template: https://github.com/shawntabrizi/polkadot-stack-template/issues

---

## 15. Demo script (5 minutes — practice with a timer)

1. **(0:00–0:30) The product.** "Project Individuality covers identity privacy on Polkadot. There's no equivalent for transaction privacy. StealthPay is that primitive."
2. **(0:30–3:30) The demo.** Two browser windows side-by-side. Window A is the recipient: register a meta-address (one click). Window B is the sender: paste recipient's address, attach a memo "lunch", send 5 PAS. Switch to Blockscout: show that the receiving address has no on-chain link to the recipient. Back to Window A: hit Scan, the payment appears with the correct memo. (Stretch: Spend page, deposit + Tornado-style withdraw to a fresh address.)
3. **(3:30–4:30) What broke.** The 1–2 sharp edges I hit on PVM, with bug-report links. The crypto choices and why. The trade-offs in the protocol (amount privacy out of scope, sender-side traceable, etc.). Be honest — Parity values this section more than the demo.
4. **(4:30–5:00) Where this goes.** XCM-routed stealth payments across parachains. Integration with Project Individuality so a recipient can prove "I'm a registered person who received the airdrop" without revealing which address. Hand off.

---

## 16. Acceptance checklist (before you push the last commit)

Mirror of the program's §8 "Before You Submit" plus project-specific items:

**Code**

- [ ] `npm run build` clean in both `contracts/pvm/` and `web/`
- [ ] All Hardhat tests pass: `npx hardhat test`
- [ ] All crypto unit tests pass: `cd web && npm test`
- [ ] No dead code, no template scaffolding leftovers
- [ ] `cargo +nightly fmt --check`, `prettier --check`, `npm run lint` all green

**Repo**

- [ ] Meaningful commit history (no `wip`, `fix`, `more` chains)
- [ ] README at root with everything from §7 of the program guidelines
- [ ] `retrospective.md` filled in
- [ ] `BUG_REPORTS.md` filled in (this is a feature, not a bug)
- [ ] `deployments.json` updated with Passet Hub contract address(es)

**Deployment**

- [ ] Web app live at `stealthpay-XX.paseo.li`
- [ ] Tested from a fresh browser session in incognito
- [ ] Contract verified on Blockscout (or instructions to verify in README)

**Demo**

- [ ] Live demo dry-run completed end-to-end against the deployed contract
- [ ] Recorded fallback video on disk
- [ ] Slide deck prepared (5 min, demo as the centerpiece)

---

## 17. What success looks like

A reviewer reads the README in 5 minutes, clones the repo, runs `npm install && npm run build` cleanly, opens the live `stealthpay-XX.paseo.li` URL, registers with their MetaMask in 30 seconds, sends themselves a payment from a second account, sees it appear with the right memo on Scan, and understands from the retrospective both **what you actually built** and **what you learned about the PVM stack along the way**. If the ZK stretch shipped, they spend an extra minute clicking through the Mixer flow. If it didn't, they read your bug report against polkadot-sdk and nod. Either outcome is a win.

The pitch story they walk away with is: _"This person built the missing transaction-privacy primitive for Polkadot Hub in 3 days, properly, with real crypto and an honest threat model, and ported a billion-dollar pattern from Ethereum to PVM."_ That's the sentence that gets you the interview.

---

_This PRD was written based on verified current state of the Polkadot stack as of April 22, 2026. Versions, precompile addresses, and tool surfaces were confirmed against official docs, npm registry entries, and the polkadot-stack-template's pinned Key Versions table. If any pinned version has moved by the time you read this, prefer the newer version — the architecture is version-agnostic._
