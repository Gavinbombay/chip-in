# Chip In acceptance results

Recorded for R1–R4. AC-27 and AC-31 include a browser pass that this job could not run. The chain reads and the page build for those rows are recorded beside the handoff.

AC-1 PASS arc-forge 1.7.1-dev, foundry profile network arc, solc 0.8.37, evm osaka; Arc probe fork 4 passed (`r1` log and a fresh fork run of ArcProbe).
AC-2 PASS `test_CreateBill_StoresFieldsAndEmits` in `r1-test-local.txt`.
AC-3 PASS `test_CreateBill_OpenSharesAllowed` and `testFuzz_EqualSplit_SumsToTotal` (2000 runs, re-run this session).
AC-4 PASS create-bill revert and boundary tests in `r1-test-local.txt` (17 passed in ChipInCreateBillTest).
AC-5 PASS `test_Pay_AssignedSharePullsExactAmountAndEmits` and `test_Pay_OpenShareAssignsPayer`.
AC-6 PASS `test_Pay_RevertsDoublePaySameShare` and `test_Pay_RevertsSecondTakerOfOpenShare`.
AC-7 PASS `test_Pay_RevertsWhenBillFunded` and `test_Pay_ExcessAllowanceOnlyPullsShare`.
AC-8 PASS `test_Pay_LastShareMarksFundedAndEmits`, `test_Release_SendsTotalToPayeeAndEmits`, `test_Release_AnyoneCanCall_FundsStillGoToPayee`.
AC-9 PASS `test_Refund_AfterDeadlineReturnsContribution`, `test_Refund_SumsMultipleSharesOfSamePayer`, `test_Refund_RevertsSecondTime`.
AC-10 PASS deadline edge tests in ChipInPayTest, ChipInRefundTest, and ChipInReleaseTest, all passed in `r1-test-local.txt`.
AC-11 PASS `test_CreateBill_RevertsOnZeroPayee`.
AC-12 PASS fork of `https://rpc.testnet.arc.io`: 3 passed, 0 failed (`r1-test-fork.txt`).
AC-13 PASS the same passing tests expect the five events (`vm.expectEmit` in the suite that passed).
AC-14 PASS `test_NoFunctionAcceptsNativeValue`.
AC-15 PASS `test_Pay_RevertsWithInsufficientBalance` passed on Arc. The three `test_Reentrancy_*` tests skipped by design while the real USDC interface is present (R1 Step 6).
AC-16 PASS `test_Held_SumMatchesContractBalance` and 4 fuzz tests at 2000 runs, suite ok.
AC-17 PASS comment-stripped admin grep printed `grep_admin=0`.
AC-18 PASS `test_Constructor_SetsImmutables`; constructor args used at deploy were `25000000` and `2592000`.
AC-19 PASS `r1-test-local.txt`: 66 passed, 0 failed, 4 skipped. `r1-test-fork.txt`: 3 passed.
AC-20 PASS `test/chains.test.ts` 5 passed; mainnet chain id `0x13b2`, testnet `0x4cef52`.
AC-21 PASS fee-floor cases inside `test/chains.test.ts` (5 passed).
AC-22 PASS `test/money.test.ts` 6 passed.
AC-23 PASS `test/link.test.ts` 5 passed.
AC-24 PASS `r2-vitest.txt`: 20 passed, 0 skipped, including create, pay, double-pay rejected, release, refund, late pay rejected, and unknown bill.
AC-25 PASS `docs/` is `.nojekyll`, `index.html`, one css, and two js files; external script tags 0; external style tags 0; forbidden page-source count 0; direct-request count 0; hosts are the five Arc and GitHub names only.
AC-26 HANDED Spec copy is in `page/src/main.ts` and `page/index.html` (`r3-checklist.md`, 22 strings present). The five browser checks were not run here.
AC-27 HANDED Bill URLs return HTTP 200 from the preview (`R4_RESULTS.md` Step 8). Wrong-network, add-chain, and no-wallet rendered states need MetaMask. No wallet was available here.
AC-28 PASS Contract `0xa24184E58e30D9b97EC28084d27f9F1Cfe1E964B`. Sourcify matchId `55988963` has creation and runtime match for solc `0.8.37+commit.f401782d`. Blockscout `is_verified` true, name `ChipIn`, compiler `0.8.37+commit.f401782d`, evm `osaka`, source contains `contract ChipIn`, constructor `25000000` and `2592000`. The same record has `is_partially_verified` true and `is_fully_verified` false. Earlier `arc-forge verify-contract` and both flattened posts returned `Fail - Unable to verify`.
AC-29 PASS Bill 1 state 2. Create, both pays, and release are status `0x1`. Payee delta `750000`. Second pay of share 0 reverted with `0x9b24df5f`. Explorer lists the transactions. Hashes are in `R4_RESULTS.md`.
AC-30 PASS Bill 2 state 3. Early refund selector `0xfda10c42`. After the 15-minute wait, refund status `0x1`, contribution 0, balance delta `298716`. Late pay selector `0x53434b64`.
AC-31 HANDED `config.ts` points Arc testnet at the contract and lists bills 1 and 2. Chain reads: bill 1 state 2, bill 2 state 3, bill 2 contribution 0. Preview curls of both bill URLs returned 200. The rendered "Released" and "Deadline passed" amounts need a browser.
