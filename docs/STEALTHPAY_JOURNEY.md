# Building StealthPay on the Polkadot Stack Template

This is a short retrospective on what it felt like to build StealthPay on top of the
`polkadot-stack-template`.

It is not a polished marketing document. It is the practical story:

- what worked well
- what was rough
- where the template helped a lot
- where the SDK and stack edges showed up
- what I would warn the next team about

## Starting Point

The template was a strong base because it already had the right broad ingredients:

- a local chain workflow that actually runs
- both EVM and PVM contract packages
- a React frontend already wired to Polkadot APIs
- deploy scripts and deployment syncing
- Bulletin integration already present in the repo

That matters. Without that scaffolding, StealthPay would have spent most of its time
just assembling a chain environment instead of building product behavior.

The biggest win from the template was not any one file. It was the fact that the repo
already thought in full-stack terms:

- runtime
- contracts
- frontend
- scripts
- deployment

That made it realistic to build something end to end instead of a half-demo.

## What Went Well

### 1. The template made local iteration possible

The local stack, deploy wiring, and frontend structure were good enough to let the work
move quickly once the real product shape became clear.

The most valuable patterns were:

- shared EVM and PVM contract layout
- existing frontend page structure
- existing `deployments.json` synchronization
- existing local `eth-rpc` + WS setup

Those pieces reduced a lot of setup waste.

### 2. PVM was viable for real product work

The repo proved that PVM is not just a toy target. We were able to build:

- `StealthPay.sol`
- `StealthPayPoolV1.sol`
- `WithdrawVerifier.sol`
- contract tests in both EVM and PVM packages

The important point is not that PVM felt identical to Ethereum. It did not.
The important point is that it was usable enough to build a real privacy-oriented flow
and validate it locally.

### 3. The frontend could tell a real user story

The project progressed from a crypto harness into a product flow:

- `Register`
- `Private Send`
- `Private Withdraw`
- `Public Recovery`

That is a big step up from “contract compiles” or “one happy-path transaction.”
It started to feel like something a judge or user could actually understand.

### 4. Bulletin integration made the memo story more interesting

Using Bulletin for encrypted delivery gave the app more than just value transfer.
It made the project feel more Polkadot-native and more product-shaped.

Instead of saying “there is a memo idea,” the app now actually:

- encrypts note material and optional text memo
- uploads that payload
- carries only the hash on-chain
- decrypts it on the recipient side

That was a strong win.

## What Was Hard

### 1. The stack is real, but the boundaries are messy

The hardest part of this project was not writing Solidity or React.
It was constantly crossing these boundaries:

- PAPI / Substrate signing
- `Revive.call(...)`
- `eth-rpc`
- `viem`
- runtime events
- Bulletin
- browser cryptography
- relayer flow

None of those layers is individually impossible. The friction comes from how many of
them have to line up for the product to feel simple.

This project repeatedly had to debug not just “a bug,” but “which layer owns this bug?”

### 2. `Revive.call(...)` and `eth_getLogs` were a real source of pain

One of the clearest rough edges was that local `eth-rpc` did not expose the expected
contract logs for `Revive.call(...)` paths.

That had real consequences:

- `announcementCount()` would increase
- contract state would be correct
- but `eth_getLogs` would still return nothing

This forced a runtime-event fallback for both announcements and pool deposits.

That was a major lesson:

Polkadot smart-contract development here cannot always assume the normal Ethereum
indexing mental model.

### 3. Wallet reality was rougher than the ideal story

There were several wallet-related difficulties:

- host environment detection issues
- `map_account()` stalls
- extension account funding issues
- unclear split between host wallet, injected extension wallet, and QR-paired Pwallet

On paper, wallet support sounds like one task.
In practice, it split into at least three different connection models with different
failure modes.

The browser extension path became the most dependable one during implementation.

### 4. Signature-based deterministic recovery was a trap

One of the biggest design reversals was realizing that re-signing the same message with
`sr25519` was not stable enough to recover the same stealth keys reliably.

That looked elegant at first. It was not production-safe for this repo.

The fix was to move to a dedicated persisted stealth seed.

That was a win in the end, but it was also a reminder that “nice cryptographic idea” and
“reliable product recovery mechanism” are not the same thing.

### 5. Local vs Paseo split was awkward

The most awkward product/integration split was:

- local StealthPay contract flow
- Bulletin Paseo for memo upload

That setup can work for development, but it is not a beautiful mental model.
It is one of those situations where the system is logically valid but product-wise
feels compromised.

This is exactly the kind of thing judges may forgive in a prototype, but users would not.

### 6. Historical state and explorer/debugging were fragile

The non-archive local run made historical inspection unreliable after enough blocks or
after restarting the stack.

That matters more than it sounds. Privacy flows depend on:

- events
- deposits
- roots
- announcements
- historical matching

So weak historical access makes debugging much harder than for a simple dApp.

Adding archive-mode startup support was the right correction.

## Biggest Failures and Course Corrections

### 1. The first withdraw flow proved control, not privacy

The earlier plain withdraw flow moved funds from the recovered stealth account to a
known destination.

It worked, but it also showed the exact privacy problem clearly:

- the stealth receive was private
- the public consolidation was not

That failure was actually useful because it forced the architecture discussion in the
right direction instead of letting the project pretend the privacy story was complete.

### 2. The project had to stop treating docs as reality

At the start, some project docs described the intended future more than the actual repo.
That is a common hackathon problem.

A large part of making this project sane was repeatedly bringing docs back in sync with:

- what the code actually did
- what was still missing
- what was only a stretch goal

That discipline mattered. Without it, the project would have looked better on paper than
it really was.

### 3. The direct sender-to-pool path changed the product for the better

Moving toward the sender-to-pool privacy flow was one of the strongest architectural
improvements.

It made the story more impressive and more coherent:

- sender does not just fund a stealth address
- sender creates a private pool deposit
- recipient privately recovers the note
- recipient withdraws through a relayer

That is a much stronger judge-facing narrative than a plain stealth receive followed by a
public withdraw.

### 4. The `Revive.call` failure was not a generic PVM limitation

The most important live Paseo debugging thread was the private-send failure through a
Substrate-origin `Revive.call`.

The first symptoms were misleading:

- ETH RPC calls to `announcePrivateDeposit(...)` worked
- browser-extension Substrate sends reverted with `Revive.ContractReverted`
- the outer `StealthPay` contract surfaced only `TransferFailed()`

At first this looked like a nested contract-call or PVM runtime edge. That was too broad.
The useful turn was making the debug path surgical:

- dry-run direct `StealthPayPoolV1.deposit(...)`
- dry-run outer `StealthPay.announcePrivateDeposit(...)`
- compare native value, contract denomination value, and scaled values
- deploy a tiny `MsgValueProbe` contract that records the Solidity `msg.value`

The probe showed the real boundary:

```text
Revive.call.value = 1000000000000
Solidity msg.value = 100000000000000000000
```

So on Paseo, the contract-visible value was:

```text
msg.value = Revive.call.value * 1e8
```

That explained every earlier failure:

- `Revive.call.value = 1e12` overshot the `1 ether` pool denomination and reverted
- `Revive.call.value = 1e18` failed the native transfer before contract logic
- the correct value for a `1e18` pool ticket was `1e10`

After applying that scale, dry-runs for both direct pool deposit and outer
`announcePrivateDeposit(...)` succeeded. A real Substrate-signed private gift then completed
and the recipient withdrew through the relayer.

The lesson is simple: the failure was not "Substrate accounts cannot send" and not "PVM
contract-to-contract calls do not work." It was a value-unit boundary between Substrate
`Revive.call` and Solidity `msg.value`.

## Biggest Wins

The clearest wins from this build were:

- the project became a real product flow instead of a crypto experiment
- the repo now has working private-send and private-withdraw infrastructure
- Bulletin is integrated in a way that matters to the product
- there is a serious privacy direction instead of just “private-looking addresses”
- the docs are much more honest about implemented vs not-yet-implemented
- the walletless flow moved away from manual recovery files and toward Privy-backed embedded H160 wallets
- QR sharing turned the gift link into a consumer-grade handoff instead of a raw protocol URL
- the public event pipeline moved toward exact indexer lookups, so old gifts do not depend on arbitrary recent scan windows

The best moment in the build was when the full flow worked coherently:

- sender created a private deposit
- recipient scanned and matched it
- the note decrypted correctly
- the proof flow was wired
- the app could explain what was happening

That was the point where the project stopped being just technically interesting and
started feeling demo-worthy.

## Current Hosted Demo State

The current demo has been split into two branches because the product works in a normal
browser but Dot.li still has a host signing blocker.

Current demo deployment:

- stable browser frontend at `https://web-rouge-one-36.vercel.app`
- contracts on Paseo Asset Hub through `pallet-revive`
- encrypted gift payloads on Bulletin Chain
- Render-hosted relayer for storage sponsorship, public event indexing, withdrawal quotes, and withdrawal submission
- Privy as the main embedded wallet provider for walletless gift claims

Branch state:

- `master`: stable browser demo with external wallet + Privy
- `codex/browser-demo-stable`: review branch with the same stable browser demo history
- `codex/dotli-host-integration`: Dot.li / Triangle host integration work, preserved separately

The current working product story is:

1. Sender creates a fixed-denomination private gift.
2. The app encrypts the private note and memo locally.
3. The encrypted payload is uploaded to Bulletin, either directly by an authorized P-wallet or through the storage sponsor.
4. Sender deposits into the privacy pool with `Revive.call(...)`.
5. Recipient opens the private link or QR.
6. Registered recipients claim with their private inbox wallet; walletless recipients sign in through Privy and claim to the embedded H160 wallet.
7. The relayer submits the withdrawal with proof coordinates and public inputs; it does not need plaintext note secrets.

The main issue still being worked through is Dot.li host compatibility. The app has been hardened to avoid a hidden `Revive.map_account()` prompt when the sender account is already mapped, but genuinely unmapped P-wallet accounts still need that one-time mapping transaction. In Dot.li, approving the mapping transaction can stall on the signing modal. The call data is `0x6407`, which is `Revive.map_account()`, not the private gift deposit.

That matters because a P-wallet account must be mapped before it has a `pallet-revive` H160 identity capable of originating PVM contract calls. Without mapping, registering a private inbox and creating a private gift cannot proceed through that account.

The demo repo uses host permissions, product host accounts, `@polkadot-api/sdk-ink` dry-runs, and `send().signSubmitAndWatch(...)`. StealthPay should move to that model for Dot.li contract writes instead of hand-building every `Revive.call(...)` payload.

There is also a deployment constraint: Dot.li should receive the real built app archive, not a tiny external bootstrap. The proof assets should stay hosted by the relayer, otherwise the archive becomes too large and the Bulletin deploy path can run out of memory.

The product decision for the demo is therefore deliberate:

- show the working app through the normal browser deployment
- explain the intended Dot.li / Triangle path honestly
- keep the Dot.li branch alive for follow-up rather than risking the demo on a known host signing stall
- do not mix the unstable Dot.li UX back into the main demo path

## What I Think About the Template

Overall, the template is good.

Its biggest strength is that it is ambitious enough to cover the real Polkadot stack:

- runtime
- contracts
- frontend
- scripts
- deployment

Its biggest weakness is that once a project gets more product-shaped and privacy-heavy,
you start hitting stack edges that the simple examples do not prepare you for.

So my honest judgment is:

- as a starter template, it is strong
- as a production-ready abstraction layer, it is not there yet
- as a learning and shipping base for a hackathon / academy project, it is genuinely useful

That is a good outcome. It does not need to be perfect to be valuable.

## What I Think About the SDKs and Tech

### PAPI

PAPI is powerful, but once you mix it with `Revive.call(...)`, host wallets, and runtime
fallback logic, the mental model becomes heavy quickly.

It is good technology, but not low-friction technology.

### `eth-rpc` and viem

Using `viem` for reads is productive when the logs and RPC behavior match expectations.
When the indexing path diverges from the actual runtime event path, the developer has to
understand much more of the system than a normal EVM app usually would.

### PVM / Revive

This is probably the most important takeaway:

PVM is capable enough to build interesting things, but teams should expect rough edges.
If the goal is to impress judges while also helping the ecosystem, then working through
those rough edges is part of the point.

### Bulletin

Bulletin made the project more Polkadot-native and more interesting, but authorization
and network split UX were real friction points.

Technically valuable. Product-wise still rough.

## Advice to the Next Team

If I were starting again, I would do these things earlier:

1. Decide the product truth early.
   Do not let “temporary” public recovery paths pretend to be the final privacy story.

2. Treat docs as implementation artifacts, not aspirations.
   Keep them synced constantly.

3. Use archive mode sooner for debugging-heavy work.

4. Keep local-vs-testnet boundaries explicit.
   Hidden network mixing causes confusion quickly.

5. Assume wallet integration will take longer than it looks.

6. Be ready to build runtime fallbacks.
   Do not assume Ethereum-style indexing semantics everywhere.

7. Protect the user story.
   Judges care about the underlying tech, but they also care whether an actual person
   could understand and use the app.

## Final Take

This project was not “smooth.” It had real failures, redesigns, and stack friction.
But that is also why it became stronger.

The build journey ended up proving something useful:

Polkadot’s newer contract and storage surfaces are strong enough to support a serious
privacy-oriented application, but getting there still requires a lot of engineering
honesty and a willingness to work through rough edges instead of papering over them.

That is the real story of building StealthPay on this template:

- the template gave enough structure to move fast
- the stack gave enough capability to build something meaningful
- the rough edges forced better engineering decisions
- the final result became much more credible because the project stopped pretending the
  hard parts were easy

That is a good journey to document.
