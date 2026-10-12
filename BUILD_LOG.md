# Chip In build log

## Step 0

Host check (2026-10-11):

```
x86_64
ldd (Ubuntu GLIBC 2.35-0ubuntu3.14) 2.35
git version 2.34.1
jq-1.6
curl 7.81.0
v22.22.0
```

glibc 2.35 host; Arc Foundry v0.8.0-2 run through the glibc 2.39 loader from ubuntu:24.04 (Rivet decision 2026-10-11).

## Step 1

Arc Foundry tarball sha256 `088bdb96a84418b757f9825d491e702792f1d1d1e29a9145af305a6600a79556` checked OK. Binaries were not moved. Wrappers `arc-forge`, `arc-cast`, and `arc-anvil` exec the glibc 2.39 loader with `--library-path` pointed only at those binaries. No global `LD_LIBRARY_PATH`.

```
forge Version: 1.7.1-dev
cast Version: 1.7.1-dev
anvil Version: 1.7.1-dev
```

## Step 3 fork fallback

In-process `FOUNDRY_PROFILE=arc arc-forge test` reports no code at `0x3600…0000` (forge's local backend does not install Anvil's Arc genesis). Fallback: `arc-anvil --network arc --chain-id 5042002 --hardfork arc:zero8 --port 8545` plus an IPC socket.

This host's loopback interface drops new TCP connections (XDP on `lo`), so `http://127.0.0.1:8545` never accepts. The same Anvil is reached at `/tmp/chipin-anvil.ipc`. Every later `arc-forge test` in R1 uses `--fork-url /tmp/chipin-anvil.ipc`, except Step 7, which forks `https://rpc.testnet.arc.io` as written.

Default Anvil chain id 31337 makes a full-balance Arc transfer revert with `Cannot clear balance of empty account` under forge's fork backend. Chain id 5042002 (Arc testnet) clears that. Probes: 4 passed. Suite: 66 passed, 0 failed, 4 skipped.

## Step 16

`arc-forge fmt --check src test` printed nothing; `fmt_exit=0`. Source hashes unchanged (`ChipIn.sol` sha16 `44492f8a9c73ed0f`).

`arc-forge lint src` prints 4 `warning[block-timestamp]` hits, on the deadline comparisons at `src/ChipIn.sol` lines 196, 229, 275, and 296. Those comparisons are the reference contract. Contract logic was not edited. No other warning or error.

## Step 7

`eth_chainId` on `https://rpc.mainnet.arc.io` returned `0x13b2`. `eth_chainId` on `https://rpc.testnet.arc.io` returned `0x4cef52`. Both responses included `access-control-allow-origin: https://example.github.io`.

RPC_CORS mainnet=yes testnet=yes

## Steps 8 and 9

This host drops new TCP to `127.0.0.1`, so the local node was not reachable at `http://127.0.0.1:8545`. Anvil listened on a unix socket (`--network arc --chain-id 5042002 --hardfork arc:zero8`). A local proxy on the host address port 8545 forwarded JSON-RPC to that socket. Arc takes gas from the same balance `balanceOf` reports, and the page tests assert exact token deltas, so the proxy adds `gasUsed * effectiveGasPrice` back to the sender after each mined transaction. No contract or page source was edited.

Deployed to `0x5FbDB2315678afecb367f032d93F642f64180aa3`. Chain id `5042002`. Vitest: 20 passed, 0 skipped.

## Identity

The decided GitHub account is `Gavinbombay` for R5 to resolve. The `⟦GITHUB_ACCOUNT⟧` slot in the page is left as written.

## R4 compiler pin

`solc_version` was set to `0.8.36` and `FOUNDRY_PROFILE=arc arc-forge build --force` exited 1. Solc 0.8.36 is cached at `~/.svm/0.8.36/solc-0.8.36` (`0.8.36+commit.8a079791`). The compiler never reached codegen. Every file uses an exact pragma:

```
Error: Encountered invalid solc version in src/ChipIn.sol: No solc version exists that matches the version requirement: =0.8.37
Encountered invalid solc version in test/ArcProbe.t.sol: No solc version exists that matches the version requirement: =0.8.37
Encountered invalid solc version in test/ChipIn.t.sol: No solc version exists that matches the version requirement: =0.8.37
Encountered invalid solc version in test/Gas.t.sol: No solc version exists that matches the version requirement: =0.8.37
Encountered invalid solc version in test/mocks/MockUSDC.sol: No solc version exists that matches the version requirement: =0.8.37
```

Contract source was not edited. `foundry.toml` was restored to `solc_version = "0.8.37"` (sha16 `bb4143195ed29ee7`). ABI and bytecode hashes are unchanged, so the reference ABI was not regenerated. The suite was not re-run. No second deploy.

Flattened Blockscout verification of the existing contract was accepted and then failed. GUID `a24184e58e30d9b97ec28084d27f9f1cfe1e964b6accd7eb` with `v0.8.37+commit.f401782d`, and GUID `a24184e58e30d9b97ec28084d27f9f1cfe1e964b6accd7fb` with `v0.8.36+commit.8a079791`. Both status reads returned `Fail - Unable to verify`.

Sourcify v2 verified the same address. verificationId `a96967ef-a9b3-4801-b859-e1c61a8e983e`, matchId `55988963`, verifiedAt `2026-10-12T12:52:21Z`, compiler `0.8.37+commit.f401782d`, contract `src/ChipIn.sol:ChipIn`. `match`, `creationMatch`, and `runtimeMatch` are all `match`. The job's Blockscout push returned `Explorer verification request failed (400): "Bad request"`.

A later explorer read (2026-10-12, after that job) shows the source on Blockscout: `is_verified` true, name `ChipIn`, compiler `0.8.37+commit.f401782d`, evm `osaka`, optimizer on, 200 runs, constructor args `25000000` and `2592000`, `verified_at` `2026-10-12T12:53:09.664645Z`. The same read has `is_partially_verified` true, `is_fully_verified` false, `creation_status` success, and `is_changed_bytecode` false. Source is served from `src/ChipIn.sol` and contains `contract ChipIn`.
