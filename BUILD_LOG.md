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
