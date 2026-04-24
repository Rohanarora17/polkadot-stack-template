# Crypto Notes

This file is the StealthPay crypto working spec for the code that currently exists in this repo.

## Status

Implemented now:

- dedicated stealth seed generation, persistence, export, and import
- deterministic stealth key derivation from the dedicated stealth seed plus chain ID
- private note encryption and decryption from the stealth shared secret
- fixed-denomination privacy-pool note construction
- bearer gift envelope encryption and decryption for walletless claim links
- encrypted note backup export and import
- browser-worker Groth16 proof generation inputs for private withdraw
- relayer submission with proof coordinates and public inputs
- meta-address encoding and decoding
- stealth-address derivation for sender-side payments
- recipient-side announcement scan and match logic
- stealth private-key recovery from `(spendingPrivKey, sharedSecret)`
- recipient-side withdraw signing from the recovered stealth private key
- round-trip tests in [web/src/crypto/stealth.test.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/stealth.test.ts)

Not implemented yet:

- formal published test vectors in docs

## Libraries

Only these crypto libraries are allowed in the current browser stealth flow:

- `@noble/ciphers/chacha.js`
- `@noble/ciphers/utils.js`
- `@noble/hashes/pbkdf2.js`
- `@noble/hashes/sha2.js`
- `@noble/curves/secp256k1.js`
- `@noble/hashes/sha3.js`
- `@noble/hashes/utils.js`

Do not use these in `web/src/crypto`:

- `ethers`
- `web3`
- `crypto.subtle`
- `Math.random`
- `Buffer`
- wrong-curve imports such as `ed25519`, `sr25519`, or `secp256r1`

## Current Scheme

All current stealth math is on `secp256k1`.

- spending private key: `s`
- spending public key: `S = s * G`
- viewing private key: `v`
- viewing public key: `V = v * G`

The old signature diagnostic message is:

```text
StealthPay v1: stealth keys for chain <chainId>
```

The production Register / Scan flow no longer derives keys directly from a fresh wallet
signature. Instead it uses a dedicated 32-byte stealth seed that is:

- generated once on first registration
- stored locally per `(originSs58, chainId)`
- shown to the user for backup/export
- accepted back through manual import on a fresh browser

The code derives:

```text
spendingPrivKey = keccak256(seed || "chain:<chainId>" || "spending") -> scalar mod n
viewingPrivKey  = keccak256(seed || "chain:<chainId>" || "viewing")  -> scalar mod n
```

This is implemented in [web/src/crypto/stealth.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/stealth.ts) via `deriveKeysFromSeed(...)`.

The old `deriveKeysFromSignature(...)` helper still exists only for the hidden lab / diagnostics flow.

## Meta-Address Format

The current encoded meta-address is:

```text
compressedSpendingPubKey (33 bytes) || compressedViewingPubKey (33 bytes)
```

Total encoded length:

- `66 bytes`
- hex encoded as `0x` + 132 hex chars

Helpers:

- `encodeMetaAddress(...)`
- `encodeMetaAddressHex(...)`
- `decodeMetaAddress(...)`

## Sender-Side Derivation

Given recipient `(S, V)`:

1. Generate ephemeral secret `r`
2. Compute `R = r * G`
3. Compute shared point `Q = r * V`
4. Compute `sharedSecret = keccak256(compressed(Q))`
5. Compute stealth point `P = S + H(sharedSecret) * G`
6. Compute stealth address from the uncompressed public key:

```text
addr(P) = keccak256(uncompressedPublicKeyWithout04Prefix)[12:32]
```

The current sender output is:

- `stealthAddress`
- `ephemeralPubKey`
- `viewTag = sharedSecret[0]`
- `sharedSecret`

This is implemented in `deriveStealthAddress(...)`.

## Recipient Scan Logic

The current scan algorithm for a candidate announcement uses:

```text
sharedSecret' = keccak256(compressed(v * R))
if sharedSecret'[0] != viewTag: reject
P' = S + H(sharedSecret') * G
if addr(P') != announcedStealthAddress: reject
else match
```

This is implemented in `scanAnnouncement(...)`.

The current recovered stealth private key is:

```text
stealthPriv = (s + H(sharedSecret)) mod n
```

This is implemented in `deriveStealthPrivateKey(...)`.

## Legacy Public Recovery Flow

The older public recovery UX uses the recovered stealth private key directly as a local
secp256k1 account for a plain native-token transfer. This is no longer the primary privacy
path, but it remains useful as an advanced recovery and debugging route.

For a matched stealth payment, `ScanPage` now:

1. recovers `stealthPriv = (s + H(sharedSecret)) mod n`
2. converts that 32-byte key into a local EVM-style account
3. estimates the transfer gas for a plain value transfer
4. computes:

```text
withdrawAmount = stealthBalance - (gasLimit * gasPrice)
```

5. sends the spendable balance to the chosen destination address

This is implemented in:

- [web/src/pages/ScanPage.tsx](/Users/rohan/polkadot-stack-template/web/src/pages/ScanPage.tsx)
- [web/src/utils/stealthWithdraw.ts](/Users/rohan/polkadot-stack-template/web/src/utils/stealthWithdraw.ts)

## Direct Private Pool Note Delivery

The current primary privacy path no longer sends value to the stealth address first.

Instead the sender uses the stealth ECDH output only to privately deliver a fixed-denomination pool
note to the recipient.

For the current v1 flow:

- `denomination = 1 UNIT`
- `scope = pool.scope()`
- `nullifier` and `secret` are random field elements
- `commitment = Poseidon(scope, nullifier, secret)`
- `nullifierHash = Poseidon(scope, nullifier)`

The sender uploads one encrypted Bulletin payload that contains:

- the note material needed for later private withdraw
- an optional human memo string

The encryption key is derived from the same stealth `sharedSecret`:

```text
privateNoteKey = keccak256(sharedSecret || "private-note:v1")
```

The payload is encrypted with `XChaCha20-Poly1305` and uploaded as a compact JSON envelope:

```json
{ "v": 1, "n": "0x...", "c": "0x..." }
```

The on-chain `memoHash` is:

```text
memoHash = blake2b-256(encryptedEnvelopeBytes)
```

The direct sender-to-pool contract call is:

- `announcePrivateDeposit(pool, commitment, ephemeralPubKey, viewTag, memoHash)`

## Text Memo Encryption

Human text memos are still optional. When present, they are included inside the same encrypted
private delivery payload rather than stored as a separate Bulletin object.

The older standalone memo flow is still relevant for the legacy public stealth transfer path, but
the primary privacy v1 path now bundles:

- note material
- optional text memo

into one encrypted Bulletin blob.

The memo-specific encryption primitive is still:

```text
memoKey = keccak256(sharedSecret || "memo:v1")
```

The sender then:

1. UTF-8 encodes the memo text
2. rejects it if it exceeds `512 bytes`
3. generates a random 24-byte nonce
4. encrypts the text with `XChaCha20-Poly1305`
5. encodes the uploaded envelope as compact JSON bytes:

```json
{ "v": 1, "n": "0x...", "c": "0x..." }
```

The uploaded Bulletin bytes are hashed as:

```text
memoHash = blake2b-256(envelopeBytes)
```

`memoHash` is the only memo-related value stored in the `Announcement` event.

This is implemented in:

- [web/src/crypto/memo.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/memo.ts)
- [web/src/hooks/useBulletin.ts](/Users/rohan/polkadot-stack-template/web/src/hooks/useBulletin.ts)
- [web/src/crypto/privateNote.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/privateNote.ts)
- [web/src/crypto/privatePool.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/privatePool.ts)

## Private Withdraw Context

The current private pool v1 uses:

- one pool
- one denomination
- one withdraw circuit

The public inputs are:

- `root`
- `nullifierHash`
- `scope`
- `context`

The private inputs are:

- `nullifier`
- `secret`
- Merkle path

The relayer-bound context is:

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

This prevents the relayer or client from changing recipient or fee after proof generation.

## Encrypted Note Backup

Private withdrawal is no longer gated behind an encrypted note backup export in the main
consumer UI. Registered gifts can be rediscovered through the recipient's stealth identity,
and walletless bearer gifts use the embedded H160 wallet provider when configured.

The encrypted note backup format still exists as an advanced recovery artifact.

The current backup format is:

- versioned JSON
- PBKDF2-SHA256 key derivation
- XChaCha20-Poly1305 payload encryption
- includes pool address, denomination, and the note material required for recovery

This is implemented in:

- [web/src/crypto/privatePool.ts](/Users/rohan/polkadot-stack-template/web/src/crypto/privatePool.ts)

## Current Chain Usage

The current contract and frontend use:

- `setMetaAddress(spendingPubKey, viewingPubKey)` to register
- `announceAndPay(stealthAddress, ephemeralPubKey, viewTag, memoHash)` to send
- `announcePrivateDeposit(pool, commitment, ephemeralPubKey, viewTag, memoHash)` for the direct sender-to-pool privacy path

For the current MVP slice:

- `memoHash = 0x00..00` means “no memo”
- non-zero `memoHash` means the sender uploaded an encrypted text memo envelope to Bulletin Chain
- `RegisterPage` and `ScanPage` share the same stored/imported stealth seed instead of asking
  the wallet to sign on every page load
- the private claim UI uses the StealthPay public indexer first for exact commitment, memo hash, and nullifier lookup
- if the indexer is unavailable, it falls back to browser cache, Blockscout / `eth_getLogs`, and bounded `Revive.ContractEmitted` runtime-event decoding
- scan confirmation now also attempts Bulletin fetch/decrypt for matched non-zero memos

## Current Verification

The current crypto tests cover:

- same signature + same chain ID -> same keys
- same signature + different chain ID -> different keys
- same dedicated seed + same chain ID -> same keys
- same dedicated seed + different chain ID -> different keys
- text memo encrypt/decrypt round-trip
- withdraw amount calculation subtracts the estimated fee correctly
- wrong shared secret fails text memo decryption
- repeated encryption of the same text produces different nonce/ciphertext
- `memoHash` is deterministic for the exact uploaded bytes
- sender derives a stealth payment that the intended recipient matches
- wrong recipient does not match
- recovered stealth private key maps back to the announced stealth address
- announcement matching across a list of candidates in `matchAnnouncements(...)`

Run:

```bash
cd /Users/rohan/polkadot-stack-template/web && npm run test:crypto
```

## Known Risks and Open Questions

- The dedicated seed must be backed up if the user wants to restore scanning on a new browser or device.
- The old signature-derived-key path is not safe for production recovery in this repo because `sr25519` message signatures are not stable across repeated signing calls.
- The current flow proves receive-side derivation and announce/send behavior, and now has a local-stack runtime fallback for recipient-side scan UX.
- The current private withdraw path is a real Groth16-verified pool withdraw through a relayer, but the hidden stealth-to-pool fallback architecture is not active yet.
- The older plain native transfer from the recovered stealth account still exists only as the public recovery path.
- Memo upload happens before the on-chain send in the current UX, so a failed `announceAndPay` can still leave an unused Bulletin blob.
- Browser proof generation works in a worker. The consumer path should not send private witness material to the relayer; the relayer's legacy `proofInput` fallback is a remaining cleanup item, not the target production trust model.
- Bearer gift links and QR codes are sensitive until redemption because the gift key in the hash route can decrypt the private note envelope.
- The current implementation uses one-byte `viewTag` filtering only after the sender-side derivation; large-scale scan performance still needs to be proven in the actual `ScanPage`.
- The runtime-event fallback depends on retained Substrate state, so very old local blocks can still fall out of scan reach even when contract state remains intact.
- Bulletin authorization, gateway availability, and retention behavior remain external dependencies even though the text memo flow is now implemented.
