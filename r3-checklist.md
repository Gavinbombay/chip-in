# R3 checklist

Checked against CHIPIN_UI_SPEC.md sections 2 to 9 after copying the reference page. String counts from the runbook command are all at least 1.

## 2. Screens

- OK 2.1 Intro heading and body: "Split a bill in USDC on Arc" and the one-person-covers paragraph.
- OK 2.1 Create a bill panel.
- OK 2.1 Open a bill link, helper text, toast "That link is missing a valid chain, contract or bill number."
- OK 2.1 Demo bills empty copy uses the chain name, so the default Arc chain reads "No deployment is configured for Arc in this build."
- OK 2.2 Title "Bill <id>", badges "Known contract" and "Unknown contract", unknown-contract notice.
- OK 2.2 Summary: state, "<paid> of <total> USDC covered", progressbar role, "Pays out to", local deadline.
- OK 2.2 Shares table columns and the Pay / Waiting / Unpaid / Anyone / You cells.
- OK 2.2 Release button, step pills "1. Approve exact amount" and "2. Pay share".
- OK 2.2 Your contribution panel, including the no-wallet and wrong-network sentences.
- OK 2.2 Share this bill, "Copy link", toasts "Link copied." and "Copy failed. Select the link text and copy it."
- OK 2.3 Invalid link heading "This link is not a bill", the three reason sentences, "Go to the home page".
- OK 2.4 No code at the address, and UnknownBill, use the specified sentences.
- CHANGED 2.4 Network failure now shows "Could not reach the network. Check your connection and try again." and a Retry button. The reference printed the raw error and a "Back to home" link.

## 3. Create form

- OK Fields, defaults, validation messages, cap helper, and "Review and create" confirmation sentence match the spec.
- OK Status lines "Confirm in your wallet…", "Sent. Waiting for the block…", "Bill created." with the clipboard toasts.

## 4. States and copy

- OK Open, Covered, Released, and Deadline passed badges and the four sentences. Time left uses "2d 3h left" shape.

## 5. Wallet and network

- OK "Connect wallet", network badge, "Wrong network", "Switch to Arc" / "Switch to Arc Testnet" from the chain name.
- OK EIP-6963 discovery, numbered chooser, no-wallet toast, accountsChanged and chainChanged.
- OK Writes on the wrong network toast "Switch your wallet to Arc first."

## 6. Transactions

- OK Writes go through feeOverrides. Pay checks the balance sentence, approves the exact share, then pays.
- OK SharePaidAlready copy is "That share was just paid by someone else. Pick another share."
- OK Release and refund disable the button while pending. Success shows "View transaction".

## 7. Loading, empty and error states

- OK Two skeleton bars while a bill loads. Home with no deployment shows the empty demo copy.
- OK Status lines use aria-live="polite". The toast has role="status".

## 8. Accessibility and responsiveness

- OK Skip link first, header, main tabindex="-1", footer, lang="en", viewport.
- OK Focus rings are 3px accent. Reduced motion disables the skeleton animation. Dark scheme is defined.
- CHANGED 8 Touch targets: button min-height set to 36px so controls meet the spec.

## 9. Footer

- OK "Split a bill in USDC on Arc. No server, no accounts, no fees."
- OK "Built by GavinBombay" is present. Source still points at the REPO_URL account slot.

## Step 7 browser pass

No browser in this job. Handed to the browser list in the build report. Not marked PASS.

- R3-7 home screen HANDED
- R3-7 connect wallet and wrong network HANDED
- R3-7 invalid link toast HANDED
- R3-7 unsupported chain heading HANDED
- R3-7 keyboard, zoom, and dark mode HANDED
