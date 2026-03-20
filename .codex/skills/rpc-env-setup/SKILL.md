---
name: rpc-env-setup
description: Configure RPC env vars for the supported chains and sanity-check connectivity for linkdrop-agent.js.
---

Goal
- Set `RPC_URL_*` env vars so `linkdrop-agent.js` can reliably read chain state and submit transactions.

What to set
- Base (default): `RPC_URL_BASE`
- Optional per-chain: `RPC_URL_POLYGON`, `RPC_URL_ARBITRUM`, `RPC_URL_OPTIMISM`, `RPC_URL_AVALANCHE`
- Optional global fallback: `RPC_URL`

Suggested public RPCs (development only)
- `RPC_URL_BASE=https://mainnet.base.org`
- `RPC_URL_POLYGON=https://polygon.drpc.org`
- `RPC_URL_ARBITRUM=https://arb1.arbitrum.io/rpc`
- `RPC_URL_OPTIMISM=https://mainnet.optimism.io`
- `RPC_URL_AVALANCHE=https://api.avax.network/ext/bc/C/rpc`

Sanity checks
1. Verify CLI JSON help works:
   - `node linkdrop-agent.js --help`
2. Verify RPC is being used (chain-specific var should win over `RPC_URL`):
   - Temporarily set only one of `RPC_URL_BASE`/`RPC_URL` and run `send` with missing `PRIVATE_KEY` to confirm error JSON still prints.

Notes
- For production, prefer a dedicated provider (Alchemy/Infura/QuickNode/etc.) and keep a per-chain fallback.
