# StealthPay Build Journey

This started as a Polkadot stack template project and slowly turned into a real product idea:

> send a private gift, share a link or QR, let the recipient claim without a direct public sender-to-recipient trail.

The template helped a lot because it already had the pieces I needed: contracts, frontend, local chain scripts, PVM, EVM, Bulletin, and deployment wiring. I did not have to start from an empty repo.

## What Worked

The best part was that the stack was complete enough to build end to end.

I could go from:

```text
contract -> frontend -> encrypted payload -> pool deposit -> relayer claim
```

That made the project feel real, not just a contract demo.

The privacy pool path also worked locally and on Paseo. The sender deposits into the pool, the recipient proves ownership of a note, and the relayer submits the withdrawal. On explorer, the important story is visible:

```text
sender -> pool
pool -> claim wallet
no direct sender -> recipient transfer
```

Adding QR and walletless gift links made the UX much easier to explain. That was the moment the project stopped feeling like a protocol screen and started feeling like a product.

## What Changed During The Build

The first version was closer to a stealth-address flow. It proved that we could derive hidden recipient state, but it did not fully solve the product privacy story.

The better architecture became:

- sender creates a fixed `1 UNIT` private pool note
- note is encrypted and stored as ciphertext
- registered recipients get notes through their StealthPay meta-address
- walletless recipients get a bearer link or QR
- recipient claims through a ZK proof and relayer

The fixed `1 UNIT` amount was also intentional. If every gift has the same visible value, deposits and withdrawals are harder to match by amount. A real private balance with variable amounts would need a UTXO / join-split design, which is a much bigger project.

## Main Bugs We Had To Understand

The hardest bug was the `Revive.call` deposit path.

At first it looked like PVM nested contract calls were broken. That was not the real issue. The actual issue was value scaling between Substrate `Revive.call.value` and Solidity `msg.value`.

The useful debug path was:

- dry-run direct pool deposit
- dry-run outer `announcePrivateDeposit`
- test native value vs contract denomination value
- deploy a tiny `MsgValueProbe`
- compare submitted value with Solidity-visible `msg.value`

That showed the real rule we needed:

```text
Solidity msg.value = Revive.call.value * 1e8
```

Once we used the right scaled value, the private deposit path worked.

The second big issue was indexing. Recent block scans are not good enough for private gifts. If someone opens an old gift, the app must find the exact commitment, not hope it is in the last 5,000 blocks.

So the right direction became:

- index public deposits by commitment
- index announcements by memo hash
- index withdrawals by nullifier hash
- use runtime/event fallback only as backup

The third issue was wallet UX. Mixing Substrate accounts, EVM H160 accounts, P-wallet, extension wallets, and Privy can confuse users fast. The clean product story is now:

- one connected account for sending or registering
- Privy embedded H160 wallet for walletless claims
- Wallet page explains where funds landed and how to transfer them out

## Dot.li Reality

The normal browser demo works. The Dot.li / Triangle path is still the right long-term direction, but it exposed host-specific signing issues.

The main blocker was one-time Revive account mapping:

```text
Revive.map_account()
call data: 0x6407
```

In Dot.li, unmapped P-wallet accounts can stall on the signing modal. Because of that, I kept the stable browser demo separate from the Dot.li host-integration branch instead of risking the final demo on a known host issue.

That was the right call. Better to show the product working clearly and explain the Dot.li gap honestly.

## Current Demo Path

The demo path is:

1. Create a walletless private gift.
2. Upload encrypted payload to Bulletin / storage sponsor.
3. Deposit `1 UNIT` into the privacy pool.
4. Share the private link or QR.
5. Recipient opens it and signs in with Privy.
6. Browser generates the ZK proof.
7. Relayer submits the withdrawal.
8. Explorer shows pool payout, not direct sender-to-recipient payment.

Registered recipient mode is the stronger recurring-user path. Walletless bearer links are the onboarding path.

## What I Would Improve Next

Short term:

- make the hosted relayer/indexer more reliable
- polish the Wallet page around Privy balance and transfer-out
- keep advanced proof/debug details hidden unless needed
- keep Dot.li work isolated until host signing is stable

Long term:

- indexed private balance across all notes
- stronger claim history across devices
- better DotNS recipient resolution
- eventually explore UTXO / join-split private balances

## Final Thought

This build was not smooth, but that is why it became useful. The project forced us to deal with the real edges: PVM value units, event indexing, encrypted delivery, relayer trust, walletless UX, and Dot.li host behavior.

The final product story is much clearer now:

> StealthPay makes private transfers feel like gifts. The sender funds a pool, the recipient opens a link or QR, and ZK proves the claim without exposing the sender-recipient link.
