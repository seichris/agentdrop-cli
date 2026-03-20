---
name: linkdrop-agent-cli
description: Use this repo's linkdrop-agent.js to send and claim Linkdrop transfers with strict JSON output, correct env vars, and supported chains.
---

When to use
- You need to run `linkdrop-agent.js` to `send` (createClaimLink + deposit) or `claim` (getClaimLink + redeem).
- You need outputs that are always valid JSON for automation.

Prereqs
- Install deps: `npm install`
- Set env vars (never commit secrets):
  - `PRIVATE_KEY` (0x-prefixed 32-byte hex)
  - `LINKDROP_API_KEY` optional override (must start with `zpka_`)
  - Recommended: `RPC_URL_BASE` (default chain is `base`) or `RPC_URL`
- Built-in default API key (used if `LINKDROP_API_KEY` is unset):
  - `zpka_d5ab747fd4bc4415bd0652ad673299da_c3ab6d36`

Supported chains
- `base` (default), `polygon`, `arbitrum`, `optimism`, `avalanche`

Send (native or ERC20)
1. Native token:
   - `node linkdrop-agent.js send --amount 0.01 --token native`
2. ERC20 token:
   - `node linkdrop-agent.js send --amount 5 --token 0xTokenAddress --chain polygon`
3. Parse JSON output fields:
   - `claimUrl`, `transferId`, `depositTx`

Claim
1. `node linkdrop-agent.js claim --url "<claimUrl>" --to 0xRecipient`
2. Parse JSON output field:
   - `redeemTx`

Error handling contract
- The CLI prints exactly one JSON object to stdout for every invocation.
- On error, it prints `{ ok: false, error: { code, name, message, details? } }`.

Common failures to fix quickly
- Missing/invalid env: `PRIVATE_KEY` (or invalid `LINKDROP_API_KEY` override)
- No RPC configured: set `RPC_URL_BASE` (or `RPC_URL`)
- Unsupported chain string: use one of the supported chain names above
