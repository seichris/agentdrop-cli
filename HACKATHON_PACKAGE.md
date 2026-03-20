# AgentDrop Hackathon Package

## Recommended Positioning

**Project name:** AgentDrop

**Tagline:** Distribution is my problem, not payments.

**One-liner:** AgentDrop is a Base-native agent service that creates claimable onchain credits so agent apps can subsidize first use, activate wallets, and convert recipients into paying x402 customers.

**Primary track:** Base - Agent Services on Base

**Secondary track:** Synthesis Open Track

**Honest current implementation:** this repo now ships both a strict JSON CLI for creating and claiming Linkdrop transfers and a minimal x402-gated AgentDrop service with discoverability endpoints.

**What must be true by demo day for the Base track pitch to hold cleanly:**
- The demo should show a real claim flow on Base.
- The demo should show the claimed funds being used for a first paid action or wallet activation flow.
- The x402 facilitator must be reachable in the live demo environment.

## Core Thesis

Most agent infra teams are solving checkout, not demand.

Agent builders can already accept USDC. Their real problem is activation: nobody knows their service exists, and new users or agents often do not have funded wallets for the first paid interaction. AgentDrop turns onchain transfers into a growth primitive. Instead of waiting for an agent to arrive with funds, a service can send a claimable credit, bootstrap the recipient's wallet, and sponsor the first paid action.

This makes AgentDrop a distribution layer for agent services, not just another payment rail.

## Registration Copy

### Agent name

`AgentDrop`

### Agent description

`A codex-cli agent building a programmable coupon rail for Base-native agent services. It helps services create claimable onchain credits that activate wallets, subsidize first use, and turn discovery into paid x402 usage.`

### Suggested registration payload

Replace the human fields before use. Replace the model string if you want a more exact label.

```json
{
  "name": "AgentDrop",
  "description": "A codex-cli agent building a programmable coupon rail for Base-native agent services. It helps services create claimable onchain credits that activate wallets, subsidize first use, and turn discovery into paid x402 usage.",
  "agentHarness": "codex-cli",
  "model": "gpt-5",
  "humanInfo": {
    "name": "REPLACE_WITH_FULL_NAME",
    "email": "REPLACE_WITH_EMAIL",
    "socialMediaHandle": "@REPLACE_WITH_HANDLE",
    "background": "builder",
    "cryptoExperience": "yes",
    "aiAgentExperience": "yes",
    "codingComfort": 8,
    "problemToSolve": "AI agents can already accept payments, but they still struggle to acquire customers. We are building a programmable coupon rail on Base that helps agent services fund first use, activate wallets, and convert recipients into paying x402 customers."
  }
}
```

### Human questions to ask

Ask these conversationally before registration:

1. What is your full name?
2. What is your email address?
3. What is your social handle?
4. What is your background: builder, product, designer, student, founder, or other?
5. Have you worked with crypto before: yes, no, or a little?
6. Have you worked with AI agents before: yes, no, or a little?
7. How comfortable are you with coding from 1 to 10?
8. What problem are you trying to solve with this project?

### Required reminder

Ask your human to join the official Synthesis Telegram group using the exact URL below:

`https://nsb.dev/synthesis-updates`

## Submission Copy

### Short tagline

`Claimable credits for agent onboarding on Base`

### Short description

`AgentDrop helps Base-native agent services acquire users by sending claimable onchain credits that activate wallets and subsidize the first paid x402 interaction.`

### 280-character version

`AgentDrop turns onchain transfers into a growth primitive for agent apps on Base. Services create claimable credits for target agents or users, bootstrap wallet balance, and sponsor the first paid x402 action. The result is activation, not just checkout.`

### Elevator pitch

`x402 solves how an agent gets paid. AgentDrop solves how an agent gets its first customer. We let Base-native agent services send claimable credits that fund wallet setup and subsidize the first paid interaction, turning distribution into an onchain, programmable workflow.`

### Full project description

`AI agent builders increasingly have payment rails, but they still lack reliable distribution. A service can accept USDC and still have zero users because discovery, wallet funding, and first-use activation are still broken. In practice, the bottleneck is not payment speed. The bottleneck is getting a new agent or user to try a service for the first time.`

`AgentDrop is a Base-native agent service for programmable onboarding incentives. It creates claimable onchain credits that agent services can send to target users or target agents. Those credits bootstrap a wallet, reduce first-use friction, and subsidize the first paid action. Instead of waiting for demand to appear, a service can directly fund the first step of the user journey.`

`Under the hood, AgentDrop uses Linkdrop-based claim flows with strict JSON outputs so other agents can automate around it cleanly. Our focus is not just transfer creation. Our focus is turning claimable value into measurable activation for x402-native services on Base.`

### Problem statement

`Agent services have supply but not enough demand. Most infra helps agents accept payments after a user arrives. Almost nothing helps them acquire that user, activate a wallet, and get to the first paid action.`

### Solution statement

`AgentDrop gives agent services a programmable coupon rail. A service funds claimable credits on Base, distributes them to target recipients, and uses those credits to bootstrap the recipient's first funded interaction.`

### Why now

`The ecosystem has enough payment rails to make paid agent interactions possible. What is still missing is a native growth primitive for agent apps. Claimable onchain credits are a simple way to bridge distribution and monetization.`

## Base Track Fit

### Why this fits Agent Services on Base

- It is an agent service, not a passive library.
- The service provides clear utility: user acquisition and activation for agent apps.
- The service is naturally monetizable through x402.
- Base is the right chain for cheap, fast, repeatable onboarding flows.

### Judge-safe claim

Use this wording if the final demo includes x402 payment and discovery:

`AgentDrop is a discoverable Base agent service that accepts x402 payments to create claimable onboarding credits for agents and users. It helps other services fund first use and convert recipients into paying customers.`

### Conservative fallback claim

Use this wording if the x402 wrapper is still incomplete at submission time:

`AgentDrop is a Base-native prototype for programmable onboarding incentives. It creates claimable credits through a strict JSON interface and demonstrates how agent services can fund first use and wallet activation.`

## What We Built

### Current truth from this repo

- A minimal Express service with an x402 paywall for campaign creation.
- Free discovery routes at `/`, `/health`, `/agent.json`, `/.well-known/agent.json`, `/v1/capabilities`, and `/v1/pricing`.
- A single-file CLI agent for Linkdrop transfers.
- Strict JSON-only output for success and error cases.
- `send` flow that creates and deposits a claim link.
- `claim` flow that redeems a claim link to a recipient address.
- Base is the default chain.
- Support for native token and ERC20 transfers.

### How to describe the current implementation

`We built the transfer and redemption primitive first as a JSON-first CLI, then wrapped it in a minimal x402 service so other agents can pay to create claimable onboarding credits programmatically.`

### Next layer to demo for the Base track

- A simple campaign flow: fund credit, claim credit, take first paid action.
- A recipient-side first paid action using the claimed wallet balance.

## Technical Architecture

### Components

- AgentDrop service layer
- Linkdrop SDK transfer creation
- Base onchain settlement
- Recipient wallet claim flow
- x402-paid downstream service

### Flow

1. A service operator pays AgentDrop through x402 to launch an onboarding incentive.
2. AgentDrop creates a claimable transfer on Base.
3. The target agent or user claims the credit into a wallet.
4. The recipient uses the funded wallet for a first paid action.
5. The service measures claim-to-activation conversion.

### Stack

- Node.js
- `linkdrop-sdk`
- `viem`
- Base
- x402 for service monetization

## Demo Script

### 60-second version

`Payments are not the hard part anymore. Activation is. AgentDrop helps Base-native agent services acquire users by sending claimable onchain credits that fund the first interaction.`

`Here, a service operator creates a small onboarding incentive. AgentDrop generates a claimable transfer on Base. The recipient claims it into a wallet. Then the recipient uses those funds for a first paid action.`

`The important point is that this is not just a transfer tool. It is a growth primitive for agent apps: discover, claim, activate, pay.`

### Live demo steps

1. Show the service endpoint or CLI creating a claimable credit on Base.
2. Show the JSON response with the claim URL and transfer ID.
3. Open the claim flow and redeem to a recipient wallet.
4. Show the onchain transaction on Base.
5. Show the recipient using the wallet for a first paid action.
6. Close with the claim: `x402 solves payment collection; AgentDrop solves first-use activation.`

## Judge Q and A

### What problem are you solving?

`Distribution for agent services. Builders can accept money, but they still cannot reliably get a new agent or user to try their product.`

### Why is this an agent service?

`Other agents and humans can use AgentDrop to create claimable onboarding incentives programmatically. It provides a concrete service with a clear outcome: wallet activation and first-use funding.`

### Why Base?

`Low-cost transactions, fast settlement, and a growing ecosystem for agent payments make Base the right place for repeatable onboarding flows.`

### Why not just give away credits offchain?

`Because onchain claims are programmable, composable, and verifiable. They are easier for agents to reason about and easier for judges to inspect.`

### Who pays for this?

`The service provider pays AgentDrop because customer acquisition has value. The credit is the incentive that gets a recipient to take the first funded action.`

## Suggested Conversation Log

Use this as a starter for the submission's collaboration history:

`We started by reviewing the existing Linkdrop CLI and mapping it to the prize landscape. The first instinct was to position the project as payment infrastructure, but that was too generic and weak for GTM.`

`After discussion, we reframed the problem: payments are not the bottleneck, distribution is. The project direction shifted from "faster infra" to "programmable activation for agent services."`

`The human proposed the key insight that x402 builders already have supply but not enough demand. The agent audited the codebase, identified the send-and-claim primitive as the strongest existing asset, and repositioned it as the foundation for claimable onboarding incentives on Base.`

`From there, the team aligned on a Base Agent Services submission focused on wallet activation, first-use subsidies, and claim-to-paid conversion rather than generic transfer tooling.`

## Assets To Prepare Before Submission

- Public GitHub repo
- Updated README with the AgentDrop framing
- A short demo video
- At least one Base transaction link
- A clean explanation of the x402 payment flow
- A discoverability surface for other agents
- Screenshots or terminal output showing the JSON interface
- Team registration completed on Synthesis

## Final Submission Checklist

- Register the agent and save the API key privately.
- Make sure the human has joined the official Telegram group using the exact URL above.
- Submit to `Base - Agent Services on Base`.
- Also submit to `Synthesis Open Track`.
- Keep the copy honest to the shipped demo.
- Do not claim analytics, targeting, or conversion features unless they are actually present in the demo.
