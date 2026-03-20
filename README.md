# linkdrop-sdk-cli

Single-file CLI agent for Linkdrop transfers with strict JSON-only output (success and error).

## Setup
1. Install dependencies:
   - `npm install`
2. Configure env vars (see `.env.example`):
   - `PRIVATE_KEY` (0x-prefixed 32-byte hex)
   - `LINKDROP_API_KEY` (must start with `zpka_`)
   - Recommended: `RPC_URL_BASE` (default chain is `base`) or `RPC_URL`

## Supported chains
This CLI only advertises/accepts the chains supported by the current `linkdrop-sdk` runtime:
- `base` (default)
- `polygon`
- `arbitrum`
- `optimism`
- `avalanche`

## Commands
Print usage JSON:
- `node linkdrop-agent.js --help`

Send native token:
- `node linkdrop-agent.js send --amount 0.01 --token native`

Send ERC20:
- `node linkdrop-agent.js send --amount 5 --token 0xTokenAddress --chain polygon`

Claim:
- `node linkdrop-agent.js claim --url "<claimUrl>" --to 0xRecipient`

## Output contract
Every invocation prints exactly one JSON object to stdout.
- Success: `{ "ok": true, ... }`
- Error: `{ "ok": false, "error": { "code": "...", "name": "...", "message": "...", "details": { ... } } }`

## Skills
Repo-local skills for Claude and Codex live under `.claude/skills/` and `.codex/skills/`.
See `SKILLS.md` for details.
