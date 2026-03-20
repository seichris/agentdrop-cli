#!/usr/bin/env node

require("dotenv").config({ quiet: true });

const express = require("express");
const { isAddress } = require("viem");
const { paymentMiddleware, x402ResourceServer } = require("@x402/express");
const { HTTPFacilitatorClient } = require("@x402/core/server");
const { ExactEvmScheme } = require("@x402/evm/exact/server");
const {
  DEFAULT_LINKDROP_API_URL,
  DEFAULT_LINKDROP_BASE_URL,
  SUPPORTED_CHAINS,
  getAccountFromEnv,
  sendClaimableTransfer,
  serializeError,
} = require("./agentdrop-core");

const DEFAULT_PORT = 4021;
const DEFAULT_X402_PRICE = "$0.05";
const DEFAULT_X402_NETWORK = "eip155:8453";
const DEFAULT_X402_FACILITATOR_URL = "https://facilitator.x402.org";
const APP_NAME = "AgentDrop";

function getServiceConfig(env = process.env) {
  const account = getAccountFromEnv(env);
  const payTo = env.X402_PAY_TO || account.address;
  if (!isAddress(payTo)) {
    throw new Error("Invalid X402_PAY_TO address.");
  }

  const portRaw = env.PORT || DEFAULT_PORT;
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT '${portRaw}'.`);
  }

  return {
    accountAddress: account.address,
    facilitatorUrl:
      env.X402_FACILITATOR_URL || DEFAULT_X402_FACILITATOR_URL,
    port,
    price: env.X402_PRICE_USD || DEFAULT_X402_PRICE,
    payTo,
    x402Network: env.X402_NETWORK || DEFAULT_X402_NETWORK,
  };
}

function buildManifest(config) {
  return {
    name: APP_NAME,
    version: "1.0.0",
    description:
      "Programmable onboarding credits for agent services. Create claimable links on Base and other supported chains behind an x402 paywall.",
    homepage: "/",
    documentation: "/v1/capabilities",
    pricing: "/v1/pricing",
    paymentRoute: "POST /v1/campaigns",
    x402: {
      network: config.x402Network,
      payTo: config.payTo,
      price: config.price,
      facilitatorUrl: config.facilitatorUrl,
    },
    capabilities: [
      "create_claimable_credit",
      "base_native_onboarding_flow",
      "strict_json_responses",
    ],
    supportedChains: SUPPORTED_CHAINS,
  };
}

function createApp(config) {
  const app = express();
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    config.x402Network,
    new ExactEvmScheme()
  );
  const x402State = {
    ready: false,
    initError: null,
  };
  const manifest = buildManifest(config);
  const paidMiddleware = paymentMiddleware(
    {
      "POST /v1/campaigns": {
        accepts: {
          scheme: "exact",
          network: config.x402Network,
          payTo: config.payTo,
          price: config.price,
        },
        description:
          "Create a claimable onboarding credit for an agent or user.",
        mimeType: "application/json",
      },
    },
    resourceServer,
    undefined,
    undefined,
    false
  );

  async function initializeX402() {
    try {
      await resourceServer.initialize();
      x402State.ready = true;
      x402State.initError = null;
      return true;
    } catch (error) {
      x402State.ready = false;
      x402State.initError = serializeError(error);
      process.stderr.write(
        `${JSON.stringify({
          ok: false,
          warning: {
            code: "X402_INIT_FAILED",
            ...x402State.initError,
          },
        })}\n`
      );
      return false;
    }
  }

  app.use(express.json());

  app.use((req, res, next) => {
    if (req.method === "POST" && req.path === "/v1/campaigns") {
      if (!x402State.ready) {
        res.status(503).json({
          ok: false,
          error: {
            code: "X402_UNAVAILABLE",
            name: "Error",
            message:
              "x402 is unavailable because the facilitator could not be reached during startup.",
            ...(x402State.initError
              ? { details: x402State.initError }
              : {}),
          },
        });
        return;
      }

      paidMiddleware(req, res, next);
      return;
    }

    next();
  });

  app.get("/", (req, res) => {
    res.json({
      ok: true,
      service: APP_NAME,
      pitch:
        "x402 solves checkout. AgentDrop solves first-use activation for agent services.",
      endpoints: {
        health: "/health",
        manifest: "/.well-known/agent.json",
        capabilities: "/v1/capabilities",
        pricing: "/v1/pricing",
        createCampaign: "/v1/campaigns",
      },
    });
  });

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: APP_NAME,
      status: "healthy",
      accountAddress: config.accountAddress,
      x402Network: config.x402Network,
      x402Ready: x402State.ready,
      ...(x402State.initError
        ? { x402InitError: x402State.initError.message }
        : {}),
    });
  });

  app.get("/agent.json", (req, res) => {
    res.json(manifest);
  });

  app.get("/.well-known/agent.json", (req, res) => {
    res.json(manifest);
  });

  app.get("/v1/capabilities", (req, res) => {
    res.json({
      ok: true,
      service: APP_NAME,
      summary:
        "AgentDrop creates claimable credits that help agent services subsidize first use and activate wallets.",
      supportedChains: SUPPORTED_CHAINS,
      freeEndpoints: ["/", "/health", "/agent.json", "/.well-known/agent.json", "/v1/capabilities", "/v1/pricing"],
      paidEndpoints: ["POST /v1/campaigns"],
      exampleRequest: {
        amount: "0.01",
        token: "native",
        chain: "base",
        campaign: "signup bonus",
        recipientType: "agent",
      },
    });
  });

  app.get("/v1/pricing", (req, res) => {
    res.json({
      ok: true,
      service: APP_NAME,
      x402: {
        network: config.x402Network,
        payTo: config.payTo,
        price: config.price,
        ready: x402State.ready,
      },
      delivery: {
        chainDefault: "base",
        supportedChains: SUPPORTED_CHAINS,
      },
      notes: [
        "The x402 payment covers campaign creation.",
        "The claimable credit itself is funded by the service operator via the configured wallet.",
        "If x402 is unavailable, the paid route returns 503 until the facilitator is reachable.",
      ],
    });
  });

  app.post("/v1/campaigns", async (req, res, next) => {
    try {
      const body = req.body || {};
      const result = await sendClaimableTransfer({
        amount: body.amount,
        token: body.token || "native",
        chain: body.chain || "base",
      });

      res.json({
        ok: true,
        product: "agentdrop_onboarding_credit",
        request: {
          campaign: body.campaign || null,
          recipientType: body.recipientType || "agent",
          amount: body.amount,
          token: body.token || "native",
          chain: body.chain || "base",
        },
        x402: {
          network: config.x402Network,
          payTo: config.payTo,
          price: config.price,
        },
        linkdrop: result,
        nextActions: [
          "share the claimUrl with the target recipient",
          "have the recipient redeem into a wallet",
          "use the funded wallet for a first paid action",
        ],
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    const serialized = serializeError(error);
    const statusCode =
      error && Number.isInteger(error.statusCode) && error.statusCode >= 400
        ? error.statusCode
        : 400;

    res.status(statusCode).json({
      ok: false,
      error: {
        code: serialized.details?.code || "REQUEST_FAILED",
        ...serialized,
      },
    });
  });

  return { app, initializeX402, x402State };
}

async function main() {
  const config = getServiceConfig();
  const { app, initializeX402, x402State } = createApp(config);
  await initializeX402();

  app.listen(config.port, () => {
    const startup = {
      ok: true,
      service: APP_NAME,
      port: config.port,
      x402Network: config.x402Network,
      x402Price: config.price,
      x402Ready: x402State.ready,
      payTo: config.payTo,
      fundingAccount: config.accountAddress,
      linkdropBaseUrl:
        process.env.LINKDROP_BASE_URL || DEFAULT_LINKDROP_BASE_URL,
      linkdropApiUrl: process.env.LINKDROP_API_URL || DEFAULT_LINKDROP_API_URL,
    };
    process.stdout.write(`${JSON.stringify(startup)}\n`);
  });
}

main().catch((error) => {
  const serialized = serializeError(error);
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      error: {
        code: serialized.details?.code || "SERVICE_START_FAILED",
        ...serialized,
      },
    })}\n`
  );
  process.exitCode = 1;
});
