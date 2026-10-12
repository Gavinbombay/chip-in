# R4 rehearsal results

Chain 5042002 only. Solc 0.8.36 cannot compile the exact `pragma solidity 0.8.37` sources, so there was no second deploy. The rehearsal contract is the existing deployment.

TESTNET_CONTRACT=0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B

DEPLOYER=0x56b3dC710142a48624126c4c05dd08BBcbDC6aa9

PAYER2=0xAE8Fd4aD1498Fff2a00b9E9fED4b2afe90F6429e

## Compiler pin

`foundry.toml` was set to `solc_version = "0.8.36"`. `arc-forge build --force` exited 1:

```
Error: Encountered invalid solc version in src/ChipIn.sol: No solc version exists that matches the version requirement: =0.8.37
```

The same error was reported for `test/ArcProbe.t.sol`, `test/ChipIn.t.sol`, `test/Gas.t.sol`, and `test/mocks/MockUSDC.sol`. One solc fetch landed: `0.8.36+commit.8a079791`. Source was not edited. `foundry.toml` is restored to `0.8.37`. ABI sha16 stays `e6a6fa93e507c8d1`. The test suite was not re-run.

## Step 2

Deployer balance before the transfer: `20000000`.

Payer2 after the transfer: `3000000`.

- Faucet (recorded from the follow-up, not sent by this job): https://testnet.arcscan.app/tx/0x9a05dc08087b15502caed7f9cb527966fe6c2b74dfff368b66b6a9d427620978
- Transfer 3 USDC, status `0x1`, gas used 73950: https://explorer.testnet.arc.io/tx/0xe9f07e3e50bc94dd901779731c2df50f7887886a715fd3fac5e8075643d1dd1c

## Step 3

Constructor arguments `25000000` and `2592000`. They were passed last because `forge create` treats `--constructor-args` as variadic.

- Deploy, status success, gas used 1167548, effective gas price 21000000000 wei: https://explorer.testnet.arc.io/tx/0x6af9130521e477ee6a4668fcf1b24ddc60830702ec778b4057a6908031db430d
- Contract: https://explorer.testnet.arc.io/address/0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B
- Reads after deploy: `maxBillAmount` 25000000, `maxBillDuration` 2592000, `billCount` 0, `USDC` 0x3600000000000000000000000000000000000000.
- On-chain creation bytecode matches the local artifact. Runtime size 4970.

## Step 4

`arc-forge verify-contract` returned `Fail - Unable to verify`. GUID `a24184e58e30d9b97ec28084d27f9f1cfe1e964b6acbd62e`. The retry GUID `a24184e58e30d9b97ec28084d27f9f1cfe1e964b6acbd6cf` was then rate-limited. The explorer compiler list at that time ended at `v0.8.36+commit.8a079791`.

Flattened verification, one 15 second gap between posts:

- `v0.8.37+commit.f401782d`, GUID `a24184e58e30d9b97ec28084d27f9f1cfe1e964b6accd7eb`, result `Fail - Unable to verify`.
- `v0.8.36+commit.8a079791`, GUID `a24184e58e30d9b97ec28084d27f9f1cfe1e964b6accd7fb`, result `Fail - Unable to verify`.

Sourcify v2 exact match. verificationId `a96967ef-a9b3-4801-b859-e1c61a8e983e`. matchId `55988963`. verifiedAt `2026-10-12T12:52:21Z`. Compiler `0.8.37+commit.f401782d`. Identifier `src/ChipIn.sol:ChipIn`. `match`, `creationMatch`, and `runtimeMatch` are `match`. The job reported `Explorer verification request failed (400): "Bad request"` for its Blockscout push.

A later Blockscout read in this session: `is_verified` true, `is_partially_verified` true, `is_fully_verified` false, `creation_status` success, `is_changed_bytecode` false, name `ChipIn`, compiler `0.8.37+commit.f401782d`, evm `osaka`, optimizer on, 200 runs, `verified_at` `2026-10-12T12:53:09.664645Z`. Decoded constructor args `25000000` and `2592000`. Source length 13681 and it contains `contract ChipIn`. Sourcify lookup still returns the same match id. Repo URL `https://repo.sourcify.dev/contracts/full_match/5042002/0xa24184e58e30d9b97ec28084d27f9f1cfe1e964b/` responds 308 to the full-match directory.

Standard JSON is `contracts/ChipIn.standard.json`.

## Step 5

Bill A. Payee is the deployer. Shares: payer2 400000, open share 350000. Deadline `1791813210`.

| Action | Status | Gas used | Hash |
| --- | --- | --- | --- |
| createBill | 0x1 | 235531 | https://explorer.testnet.arc.io/tx/0x5f845a5a4026745431c70d60a832172342787d619e39199e357c980271433550 |
| approve 400000 (payer2) | 0x1 | 55438 | https://explorer.testnet.arc.io/tx/0x32f56e6a8c1288f8f96298750fe1012995cbffb825ad9b9b79ed4ba295649a52 |
| pay share 0 | 0x1 | 140629 | https://explorer.testnet.arc.io/tx/0x7fbea5ac6848cd774ae19e9fe9bf4afae9e2bcf2e949b5ac282fa9b637013da4 |
| approve 350000 (deployer) | 0x1 | 55438 | https://explorer.testnet.arc.io/tx/0x91dae77967eecff08c4cdffa42b98f5ee56eda2877b32f649b8b8406a0e0b134 |
| pay share 1 | 0x1 | 165224 | https://explorer.testnet.arc.io/tx/0x2a935875a90df4ad68fc98aa2eb93adc7be078cdc0012c2aada6c7198484095d |
| release | 0x1 | 70234 | https://explorer.testnet.arc.io/tx/0x15935ba5c6d84547132f88950dfb5785fd0dfc1f630128fa8d2fc091ac8a4c72 |

After create: `billCount` 1, state 0. After the first pay: payer2 `contributed` 400000. A second pay of share 0 reverted before send with selector `0x9b24df5f` (`SharePaidAlready`). After the second pay: state 1. Release status `0x1`, state 2. Deployer `balanceOf` before release `16614348`. Delta `750000`.

A later read in this session: `stateOf(1)` is 2 and `billCount` is 2.

## Step 6

Bill B. Shares 300000 and 300000. Deadline `1791810543` (2026-10-12 13:09:03Z). The wait slept until that time plus 30 seconds and exited 0.

| Action | Status | Gas used | Hash |
| --- | --- | --- | --- |
| createBill | 0x1 | 218431 | https://explorer.testnet.arc.io/tx/0xa018dd3567f87c84fe77760c92c657937beb9be1824144bc7d8d251d8000f095 |
| approve 300000 (payer2) | 0x1 | 55438 | https://explorer.testnet.arc.io/tx/0x126ba7db560b1653e66bdd36cd1388871ee90e5e566a9c3ae6c2447a1874345e |
| pay share 0 | 0x1 | 140629 | https://explorer.testnet.arc.io/tx/0x2b29a4a57d4050468d56ad4d9188bc8b5ad7b8c1718c4b4e224d310f851894e3 |
| refund | 0x1 | 61133 | https://explorer.testnet.arc.io/tx/0x65e080d2cff9385453290cda20d0dda5a8c5e580a85d4045a8c12aa6ff44ecc1 |

Early refund reverted before send with selector `0xfda10c42` (`NotRefundable`). After the wait: state 3. Payer2 balance before refund `2290290`. Refund delta `298716` (matches `^29[0-9]{4}$`). Contribution after refund `0`. Late pay of share 1 reverted before send with selector `0x53434b64` (`BillExpired`).

A later read in this session: `stateOf(2)` is 3 and payer2 `contributed(2)` is 0.

## Step 7

Explorer API read in this session:

- Logs: 8. `BillCreated` 2, `SharePaid` 3, `BillFunded` 1, `Released` 1, `Refunded` 1.
- Transactions to the contract: 8, all status `ok` (deploy, two `createBill`, three `pay`, `release`, `refund`).

No screenshot. The host has no browser. `r4-explorer.png` was not saved. The logs view is in the browser handoff.

## Step 8

`page/src/config.ts` testnet deployment is `0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B`. Demo bills are bill 1 `covered and released` and bill 2 `short and refunded`. The `⟦GITHUB_ACCOUNT⟧` slot is unchanged. Default chain stays mainnet, so the home panel still uses the mainnet empty text. The testnet labels are in the source. The production bundle constant-folds the home page to mainnet, so those two label strings are absent from `docs/`, while the testnet address is present and used for bill links.

`npx tsc --noEmit -p tsconfig.json` exited 0. `npm run build` exited 0 and printed `✓ built in 6.22s`. Output: `docs/index.html`, `docs/assets/index-BnG56TD-.css`, `docs/assets/ccip-CheAlQhh.js`, `docs/assets/index-DfCMJUuW.js`.

Preview: `npx vite preview --host 86.48.30.196 --port 4173 --strictPort`. Loopback TCP is dropped on this host, and `127.0.0.1:4173` is already taken by another process, so the preview was bound to the host address. Curl results, all HTTP 200, body 1166 bytes, "Chip In" count 4:

- http://86.48.30.196:4173/chip-in/
- http://86.48.30.196:4173/chip-in/?chain=5042002&c=0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B&bill=1
- http://86.48.30.196:4173/chip-in/?chain=5042002&c=0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B&bill=2
- http://86.48.30.196:4173/chip-in/?chain=1&c=0x0000000000000000000000000000000000000001&bill=1

The bill state text is drawn in the browser after the RPC read. These curls confirm the shell. The preview was stopped afterwards.

Wallet version: none. No MetaMask in this job. Items 1–9 below are for the operator browser pass. Bill 3 was not created through the UI.

1. Open `http://86.48.30.196:4173/chip-in/?chain=5042002&c=0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B&bill=1` without a wallet. Expect badge "Known contract", state "Released", "0.75 of 0.75 USDC covered", both shares "Paid".
2. Open bill 2 at the same host with `&bill=2`. Expect "Deadline passed", "0.00 of 0.60 USDC covered", and the sentence about taking money back.
3. Connect a wallet on another network. Expect the add-chain prompt for Arc Testnet, chain id 5042002, RPC `https://rpc.testnet.arc.io`, then a switch, then the green badge and a shortened address.
4. Switch the wallet away by hand. Expect "Wrong network" and "Switch to Arc Testnet", and expect the button to switch back.
5. Home `http://86.48.30.196:4173/chip-in/` uses mainnet as the default chain, so Demo bills shows the mainnet empty text. The testnet list (bill 1 and bill 2) is configured and appears when the default chain is testnet.
6. Create a bill in the UI from the deployer account. "Split equally", total `0.20`, people `2`, default deadline. Expect "Bill created." and "Open bill 3". Record the hash.
7. On bill 3 with payer2, pay share 1 for 0.10. Expect the approve step, the pay step, the row "Paid", and "You have paid 0.10 USDC into this bill."
8. Pay share 2 from the other account. Expect "Covered", then release, then "Released" and a "View transaction" link.
9. Keyboard: Tab starts at "Skip to content". Every button is reachable, focus rings show, dark mode and 200% zoom stay readable.

Restart the preview from `chip-in/page` with `npx vite preview --host 86.48.30.196 --port 4173 --strictPort` before that pass. Import the testnet keystores only, and delete them from the wallet after the rehearsal.
