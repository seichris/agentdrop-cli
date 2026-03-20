# AgentDrop

AgentDrop is an x402-enabled agent service for claimable onboarding credits.

It helps agent apps solve activation, not just checkout: pay AgentDrop to create a claimable credit, share the claim URL with a target agent or user, and use that funded wallet to bootstrap a first paid action.

This repo ships two layers:

- `agentdrop-service.js`: an Express service with an x402 paywall for campaign creation
- `linkdrop-agent.js`: a strict JSON CLI for the underlying Linkdrop send/claim primitive

## What It Does

- Accepts x402 payments for `POST /v1/campaigns`
- Creates claimable onchain credits using Linkdrop
- Defaults delivery to Base
- Keeps a strict JSON contract for automation
- Exposes free discovery endpoints for agents:
  - `/`
  - `/health`
  - `/agent.json`
  - `/.well-known/agent.json`
  - `/v1/capabilities`
  - `/v1/pricing`

## Supported Chains

The funding and claim primitive supports the chains available in the current `linkdrop-sdk` runtime:

- `base` (default)
- `polygon`
- `arbitrum`
- `optimism`
- `avalanche`

## Setup

1. Install dependencies:
   - `npm install`
2. Configure env vars from `.env.example`
3. Required env:
   - `PRIVATE_KEY` for the wallet that funds the claimable credit
4. Recommended env:
   - `RPC_URL_BASE` or `RPC_URL`
5. Optional service env:
   - `PORT` default `4021`
   - `X402_PAY_TO` default is the address derived from `PRIVATE_KEY`
   - `X402_NETWORK` default `eip155:8453`
   - `X402_PRICE_USD` default `$0.05`
   - `X402_FACILITATOR_URL` default `https://facilitator.x402.org`

## Run The Service

Start AgentDrop:

```bash
npm run service
```

On startup it prints one JSON object with the active x402 configuration.

Note: the service needs live access to the configured x402 facilitator URL during startup.

### Free routes

- `GET /`
- `GET /health`
- `GET /agent.json`
- `GET /.well-known/agent.json`
- `GET /v1/capabilities`
- `GET /v1/pricing`

### Paid route

- `POST /v1/campaigns`

Example request body:

```json
{
  "amount": "0.01",
  "token": "native",
  "chain": "base",
  "campaign": "signup bonus",
  "recipientType": "agent"
}
```

Successful response:

```json
{
  "ok": true,
  "product": "agentdrop_onboarding_credit",
  "request": {
    "campaign": "signup bonus",
    "recipientType": "agent",
    "amount": "0.01",
    "token": "native",
    "chain": "base"
  },
  "x402": {
    "network": "eip155:8453",
    "payTo": "0x...",
    "price": "$0.05"
  },
  "linkdrop": {
    "ok": true,
    "chain": "base",
    "claimUrl": "https://...",
    "transferId": "...",
    "depositTx": "0x..."
  }
}
```

If the request is unpaid or underpaid, the x402 middleware returns `402 Payment Required` with payment instructions.

## Use The CLI Primitive

The CLI is still available for direct automation and debugging.

Print usage JSON:

```bash
node linkdrop-agent.js --help
```

Create a native-token claim link:

```bash
node linkdrop-agent.js send --amount 0.01 --token native --chain base
```

Create an ERC20 claim link:

```bash
node linkdrop-agent.js send --amount 5 --token 0xTokenAddress --chain polygon
```

Claim a transfer:

```bash
node linkdrop-agent.js claim --url "<claimUrl>" --to 0xRecipient --chain base
```

## CLI Output Contract

Every CLI invocation prints exactly one JSON object to stdout.

- Success: `{ "ok": true, ... }`
- Error: `{ "ok": false, "error": { "code": "...", "name": "...", "message": "...", "details": { ... } } }`

## Why This Exists

x402 solves how an agent gets paid.

AgentDrop solves how an agent gets its first customer. Instead of waiting for a new user or agent to arrive with a funded wallet, a service can create a claimable credit, bootstrap the wallet, and sponsor the first paid interaction.

## Hackathon Positioning

- Primary target: `Base - Agent Services on Base`
- Secondary target: `Synthesis Open Track`

Submission copy and registration notes live in [HACKATHON_PACKAGE.md](./HACKATHON_PACKAGE.md).
