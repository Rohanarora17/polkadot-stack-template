# StealthPay Crypto

StealthPay uses cryptography for one purpose: let a sender fund a public pool while the recipient later proves they own one unspent gift note without revealing which deposit they are spending.

```text
Deposit side:  sender -> privacy pool, commitment only
Claim side:    relayer -> privacy pool -> claim wallet, nullifier only
Hidden link:   which commitment produced which nullifier
```

This document explains the cryptographic model used by the current StealthPay demo and implementation.

## Threat Model

StealthPay hides the payment graph, not all activity.

Public observers can see:

- a sender deposited `1 UNIT` into the pool
- a relayer submitted a withdrawal
- a claim wallet received `1 UNIT - fee`
- the pool address, Merkle root, commitment, nullifier hash, and transaction metadata

Public observers cannot directly see:

- which deposit funded which withdrawal
- the note secret
- the raw nullifier
- the private memo
- the bearer gift key
- which registered inbox a deposit was meant for

StealthPay does not hide:

- that the sender used the pool
- that a wallet received from the pool
- timing patterns in a small anonymity set
- amount, because this demo intentionally uses one fixed denomination

## Core Note Model

Every private gift creates a pool note:

```text
scope        = pool.scope()
nullifier    = random field element
secret       = random field element
commitment   = Poseidon(scope, nullifier, secret)
nullifierHash = Poseidon(scope, nullifier)
```

The `commitment` is public and becomes a Merkle tree leaf.

The `nullifierHash` is public only when the note is spent. It prevents double-spending without revealing the raw `nullifier`.

The `secret` and raw `nullifier` are private witness values. They must never be sent to the relayer or stored by backend services.

## Fixed Denomination

The pool uses a fixed `1 UNIT` denomination.

This is intentional. If gifts had arbitrary amounts, observers could match deposits and withdrawals by value. Fixed denomination gives every deposit the same visible amount and preserves the anonymity set.

Variable private balances would require a UTXO or join-split design. That is a larger architecture and not part of the current StealthPay demo.

## Merkle Tree

Every deposit appends one commitment leaf:

```text
leaf 0 = commitment A
leaf 1 = commitment B
leaf 2 = commitment C
...
```

To claim, the browser reconstructs the pool tree:

1. Fetch public deposit events for the pool.
2. Sort by `leafIndex`.
3. Rebuild the Poseidon Merkle tree.
4. Find the leaf matching the decrypted gift note commitment.
5. Build the Merkle path and path indices.

The Merkle path is private witness data. The contract verifier sees only the public root and the Groth16 proof.

## Why ZK Is Needed

Without ZK, the recipient would have to reveal:

```text
I am spending leaf N.
```

That would link the withdrawal to the deposit.

With ZK, the browser proves:

```text
I know nullifier and secret.
Poseidon(scope, nullifier, secret) is in this Merkle root.
Poseidon(scope, nullifier) equals this public nullifierHash.
This withdrawal is bound to recipient, relayer, fee, expiry, pool, and chain.
```

The proof does not reveal:

- the deposit leaf
- note secret
- raw nullifier
- private memo
- bearer key

The pool contract calls the Groth16 verifier contract. If the proof is valid and the nullifier has not been spent, the pool pays the recipient.

## Withdraw Context Binding

The withdrawal proof binds the public withdrawal context:

```text
context = keccak256(
  chainId,
  poolAddress,
  recipient,
  relayer,
  fee,
  expiry,
  denomination
) mod SNARK_SCALAR_FIELD
```

This prevents a relayer from changing the recipient or fee after the browser creates the proof.

Public inputs:

- `root`
- `nullifierHash`
- `scope`
- `context`

Private inputs:

- `nullifier`
- `secret`
- Merkle path
- path indices

## Relayer Boundary

The relayer is a transaction submission service, not a custodian.

The relayer receives:

- Groth16 proof coordinates: `pA`, `pB`, `pC`
- public inputs: root, nullifier hash, recipient, relayer, fee, expiry

The relayer must not receive:

- note secret
- raw nullifier
- Merkle witness
- private memo
- bearer gift key
- stealth seed
- wallet private key

The recipient could technically submit the proof directly, but then their wallet would pay gas and become the transaction sender. The relayer improves UX and avoids making the recipient pre-fund the claim wallet.

## Registered Recipient Crypto

Registered recipients publish a reusable StealthPay private inbox.

The inbox is a meta-address:

```text
compressedSpendingPubKey (33 bytes) || compressedViewingPubKey (33 bytes)
```

Encoded size:

- `66 bytes`
- hex encoded as `0x` + 132 hex chars

The private keys are derived from a dedicated StealthPay stealth seed:

```text
spendingPrivKey = keccak256(seed || "chain:<chainId>" || "spending") -> scalar mod n
viewingPrivKey  = keccak256(seed || "chain:<chainId>" || "viewing")  -> scalar mod n
```

The meta-address is public and registered under the recipient owner H160. That means observers can know the wallet has a StealthPay inbox.

It does not reveal:

- the stealth seed
- spending private key
- viewing private key
- which pool commitments belong to that inbox
- which withdrawals spend those commitments

Implementation:

- [web/src/crypto/stealth.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/stealth.ts)
- `deriveKeysFromSeed(...)`
- `encodeMetaAddress(...)`
- `decodeMetaAddress(...)`

## Registered Gift Delivery

Given recipient public keys `(S, V)`:

```text
S = spending public key
V = viewing public key
```

The sender derives an ECDH shared secret:

```text
r = random ephemeral secret
R = r * G
Q = r * V
sharedSecret = keccak256(compressed(Q))
viewTag = sharedSecret[0]
```

The sender then encrypts the private note payload with a key derived from `sharedSecret`:

```text
privateNoteKey = keccak256(sharedSecret || "private-note:v1")
```

The public announcement includes:

```text
pool
commitment
ephemeralPubKey = R
viewTag
memoHash
```

The recipient scans announcements by computing:

```text
sharedSecret' = keccak256(compressed(v * R))
if sharedSecret'[0] != viewTag: reject
try decrypt note payload
if decrypted commitment matches a pool deposit: gift found
```

The `viewTag` is only a cheap filter. It is not a privacy boundary.

## Walletless Bearer Gift Crypto

Walletless gifts do not require a registered recipient inbox.

Flow:

1. Sender creates the same private pool note.
2. Sender generates a random high-entropy bearer gift key.
3. Sender encrypts the note and optional memo into a Bulletin envelope.
4. Link or QR carries `mode=bearer`, routing metadata, `memo`, and `key`.
5. Recipient opens the link, decrypts locally, and claims to a Privy embedded H160 wallet.

Security truth:

- the bearer link or QR is the claim capability until redeemed
- anyone with the unredeemed link can claim
- backend services still cannot claim without the key
- this is a link-custody risk, not an on-chain privacy regression

The link key is sensitive. It should not be posted publicly or sent to group chats.

## Bulletin Payloads

Bulletin stores ciphertext only.

Payloads can include:

- encrypted private note material
- optional encrypted human memo
- pool address
- chain id
- created timestamp

The on-chain `memoHash` is:

```text
memoHash = blake2b-256(encryptedEnvelopeBytes)
```

`memoHash` is a content pointer and integrity check. It does not reveal the memo or note.

Implementation:

- [web/src/crypto/memo.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/memo.ts)
- [web/src/hooks/useBulletin.ts](/Users/rohan/polkadot-stack-template/web/src/hooks/useBulletin.ts)
- [web/src/crypto/privateNote.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/privateNote.ts)
- [web/src/crypto/privatePool.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/privatePool.ts)

## Announcement Purpose

An announcement is the public delivery pointer for an encrypted gift.

The registry call is:

```text
announcePrivateDeposit(pool, commitment, ephemeralPubKey, viewTag, memoHash)
```

It helps the recipient app discover encrypted gifts without exposing the note.

For registered gifts, announcements are important because the recipient scans them with their viewing key.

For walletless bearer gifts, announcements are non-blocking enrichment because the link already contains the `memo` and `key`.

## Indexer Role

The indexer stores public event facts only:

- deposits by `commitment`
- announcements by `memoHash`
- withdrawals by `nullifierHash`
- block number, block hash, event reference, pool, registry

It never stores:

- decrypted note
- raw nullifier
- note secret
- gift key
- stealth seed
- wallet private key
- plaintext memo

Frontend lookup order:

1. public StealthPay indexer
2. local browser cache
3. Blockscout / ETH RPC logs
4. bounded `Revive.ContractEmitted` runtime-event fallback

Bearer claims should not block on announcement lookup. Once the link decrypts the note, exact deposit lookup by commitment is enough to build the Merkle path.

## Wallet And Key Roles

StealthPay uses different keys for different jobs:

| Key / Wallet | Purpose | Public? | Custody |
|---|---|---:|---|
| Sender wallet | funds pool deposit and registration | yes | user wallet / P-wallet / extension |
| Registered meta-address | public private inbox for registered recipients | yes | derived from stealth seed |
| Stealth seed | derives registered inbox keys | no | user-controlled backup/import |
| Bearer gift key | decrypts walletless gift note | no until shared | link/QR holder |
| Privy claim wallet | receives walletless payout | yes after claim | Privy embedded wallet recovery |
| Relayer key | submits withdrawal txs | yes | StealthPay relayer operator |
| Bulletin sponsor key | uploads ciphertext when user storage auth is unavailable | yes | storage sponsor only |

The storage sponsor can upload encrypted bytes. It is not the sender, recipient, verifier, or spend authority.

## Advanced Recovery

The main consumer claim flow does not require downloading a recovery file.

Advanced recovery still exists for technical users:

- registered recipients can restore their StealthPay stealth seed
- encrypted note backup import/export exists as a recovery artifact
- legacy public stealth recovery tools remain under advanced surfaces

These are not the default walletless claim path. Walletless claims use the Privy embedded H160 wallet for recoverable recipient custody.

## Tests

Crypto tests cover:

- deterministic key derivation from a dedicated stealth seed
- different chain IDs produce different derived keys
- meta-address encode/decode
- sender derives a gift that the intended recipient can match
- wrong recipient does not match
- text memo encrypt/decrypt round trip
- wrong shared secret fails decryption
- repeated encryption creates different nonce/ciphertext
- `memoHash` is deterministic for exact uploaded bytes
- private pool note and commitment construction
- bearer envelope encrypt/decrypt round trip
- wrong bearer key cannot decrypt

Run:

```bash
cd /Users/rohan/polkadot-stack-template/web
npm run test:crypto
```

## Demo Explanation

Use this explanation with judges:

> A gift is a private note inside a fixed-denomination pool. On deposit, the chain only sees a commitment. On claim, the chain only sees a nullifier hash and a ZK proof. The proof says the claimant knows an unspent note inside the Merkle tree, but it does not reveal which deposit leaf they are spending. The relayer submits the proof and pays gas, but it never receives the note secret or bearer key. That is why the explorer shows sender to pool and pool to claim wallet, but no direct sender-to-recipient payment trail.

## Known Limits

- Fixed denomination protects the amount link, but it also means every demo gift is exactly `1 UNIT`.
- Privacy depends on anonymity set size; very small pools are easier to reason about by timing.
- Bearer links and QR codes are sensitive until redeemed.
- Registered inbox ownership is public; what remains hidden is which gifts belong to that inbox.
- Dot.li / P-wallet host signing is not the primary demo path until the `Revive.map_account()` signing flow is stable.
- Bulletin availability and retention are external dependencies for encrypted payload delivery.
