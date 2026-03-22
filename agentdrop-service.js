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
const DEFAULT_X402_NETWORK = "eip155:84532";
const DEFAULT_X402_FACILITATOR_URL = "https://x402.org/facilitator";
const DEFAULT_ALLOWED_CHAINS = ["base"];
const DEFAULT_ALLOWED_TOKENS = ["native"];
const DEFAULT_MAX_NATIVE_AMOUNT = "0.00001";
const DEFAULT_NATIVE_BUDGET = "0.0001";
const DECIMAL_SCALE = 18n;
const APP_NAME = "AgentDrop";

function parseCsvList(value, fallback) {
  if (!value || typeof value !== "string") {
    return [...fallback];
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length ? parsed : [...fallback];
}

function parsePositiveDecimalToScaled(input, fieldName) {
  if (typeof input !== "string" && typeof input !== "number") {
    throw new Error(`Invalid ${fieldName}. Expected a positive decimal string.`);
  }

  const value = String(input).trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Invalid ${fieldName}. Expected a positive decimal string.`);
  }

  const [wholePart, fractionalPart = ""] = value.split(".");
  if (fractionalPart.length > Number(DECIMAL_SCALE)) {
    throw new Error(
      `Invalid ${fieldName}. Too many decimal places; max is ${DECIMAL_SCALE}.`
    );
  }

  const paddedFraction = fractionalPart.padEnd(Number(DECIMAL_SCALE), "0");
  const scaled =
    BigInt(wholePart) * 10n ** DECIMAL_SCALE + BigInt(paddedFraction || "0");

  if (scaled <= 0n) {
    throw new Error(`Invalid ${fieldName}. Expected a value greater than zero.`);
  }

  return scaled;
}

function createHttpError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

function getPolicyConfig(env = process.env) {
  const allowedChains = parseCsvList(
    env.AGENTDROP_ALLOWED_CHAINS,
    DEFAULT_ALLOWED_CHAINS
  );
  const allowedTokens = parseCsvList(
    env.AGENTDROP_ALLOWED_TOKENS,
    DEFAULT_ALLOWED_TOKENS
  );
  const maxNativeAmount = parsePositiveDecimalToScaled(
    env.AGENTDROP_MAX_NATIVE_AMOUNT || DEFAULT_MAX_NATIVE_AMOUNT,
    "AGENTDROP_MAX_NATIVE_AMOUNT"
  );
  const nativeBudget = parsePositiveDecimalToScaled(
    env.AGENTDROP_NATIVE_BUDGET || DEFAULT_NATIVE_BUDGET,
    "AGENTDROP_NATIVE_BUDGET"
  );

  const maxErc20Amount = env.AGENTDROP_MAX_ERC20_AMOUNT
    ? parsePositiveDecimalToScaled(
        env.AGENTDROP_MAX_ERC20_AMOUNT,
        "AGENTDROP_MAX_ERC20_AMOUNT"
      )
    : null;
  const erc20Budget = env.AGENTDROP_ERC20_BUDGET
    ? parsePositiveDecimalToScaled(
        env.AGENTDROP_ERC20_BUDGET,
        "AGENTDROP_ERC20_BUDGET"
      )
    : null;

  return {
    allowedChains,
    allowedTokens,
    maxNativeAmount,
    nativeBudget,
    maxErc20Amount,
    erc20Budget,
  };
}

function createBudgetState() {
  return {
    pending: new Map(),
    spent: new Map(),
  };
}

function getBudgetKey({ chain, token }) {
  return `${chain}:${token}`;
}

function buildPolicySnapshot(policy, budgetState) {
  const budgetSpent = Object.fromEntries(
    Array.from(budgetState.spent.entries()).map(([key, amount]) => [
      key,
      String(amount),
    ])
  );
  const budgetPending = Object.fromEntries(
    Array.from(budgetState.pending.entries()).map(([key, amount]) => [
      key,
      String(amount),
    ])
  );

  return {
    allowedChains: policy.allowedChains,
    allowedTokens: policy.allowedTokens,
    maxNativeAmount: String(policy.maxNativeAmount),
    nativeBudget: String(policy.nativeBudget),
    budgetPending,
    budgetSpent,
    ...(policy.maxErc20Amount
      ? { maxErc20Amount: String(policy.maxErc20Amount) }
      : {}),
    ...(policy.erc20Budget ? { erc20Budget: String(policy.erc20Budget) } : {}),
  };
}

function normalizeCampaignRequest(body, policy) {
  const amountInput = body.amount;
  const tokenInput = String(body.token || "native").toLowerCase();
  const chainInput = String(body.chain || "base").toLowerCase();

  if (!policy.allowedChains.includes(chainInput)) {
    throw createHttpError(
      403,
      "CHAIN_NOT_ALLOWED",
      `Chain '${chainInput}' is not allowed for public campaigns.`,
      { allowedChains: policy.allowedChains }
    );
  }

  const tokenAllowed =
    tokenInput === "native"
      ? policy.allowedTokens.includes("native")
      : policy.allowedTokens.includes(tokenInput);
  if (!tokenAllowed) {
    throw createHttpError(
      403,
      "TOKEN_NOT_ALLOWED",
      `Token '${tokenInput}' is not allowed for public campaigns.`,
      { allowedTokens: policy.allowedTokens }
    );
  }

  const scaledAmount = parsePositiveDecimalToScaled(amountInput, "amount");
  const isNative = tokenInput === "native";

  if (!isNative && !isAddress(tokenInput)) {
    throw createHttpError(
      400,
      "INVALID_TOKEN_ADDRESS",
      "Invalid ERC20 token address."
    );
  }

  const maxAmount = isNative ? policy.maxNativeAmount : policy.maxErc20Amount;

  if (!maxAmount) {
    throw createHttpError(
      403,
      "TOKEN_POLICY_INCOMPLETE",
      `Token '${tokenInput}' is enabled without a configured amount cap.`
    );
  }

  if (scaledAmount > maxAmount) {
    throw createHttpError(
      403,
      "AMOUNT_EXCEEDS_MAX",
      `Requested amount exceeds the configured maximum for token '${tokenInput}'.`,
      {
        maxAmount: String(maxAmount),
        requestedAmount: String(scaledAmount),
      }
    );
  }

  return {
    amount: String(amountInput),
    scaledAmount,
    token: tokenInput,
    chain: chainInput,
    campaign: body.campaign || null,
    recipientType: body.recipientType || "agent",
    budgetKey: getBudgetKey({ chain: chainInput, token: tokenInput }),
    budgetLimit: isNative ? policy.nativeBudget : policy.erc20Budget,
  };
}

function assertBudgetAvailable(campaign, budgetState) {
  if (!campaign.budgetLimit) {
    throw createHttpError(
      403,
      "TOKEN_POLICY_INCOMPLETE",
      `Token '${campaign.token}' is enabled without a configured budget.`
    );
  }

  const spent = budgetState.spent.get(campaign.budgetKey) || 0n;
  const pending = budgetState.pending.get(campaign.budgetKey) || 0n;
  if (spent + pending + campaign.scaledAmount > campaign.budgetLimit) {
    throw createHttpError(
      409,
      "CAMPAIGN_BUDGET_EXCEEDED",
      `Campaign budget exceeded for ${campaign.chain}/${campaign.token}.`,
      {
        budgetLimit: String(campaign.budgetLimit),
        budgetSpent: String(spent),
        budgetPending: String(pending),
        requestedAmount: String(campaign.scaledAmount),
      }
    );
  }
}

function reserveBudget(campaign, budgetState) {
  assertBudgetAvailable(campaign, budgetState);
  const pending = budgetState.pending.get(campaign.budgetKey) || 0n;
  budgetState.pending.set(campaign.budgetKey, pending + campaign.scaledAmount);
}

function releaseBudgetReservation(campaign, budgetState) {
  const pending = budgetState.pending.get(campaign.budgetKey) || 0n;
  const next = pending - campaign.scaledAmount;
  if (next > 0n) {
    budgetState.pending.set(campaign.budgetKey, next);
    return;
  }
  budgetState.pending.delete(campaign.budgetKey);
}

function finalizeBudgetSpend(campaign, budgetState) {
  releaseBudgetReservation(campaign, budgetState);
  const spent = budgetState.spent.get(campaign.budgetKey) || 0n;
  budgetState.spent.set(campaign.budgetKey, spent + campaign.scaledAmount);
}

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
    campaignPolicy: getPolicyConfig(env),
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
    initPromise: null,
  };
  const budgetState = createBudgetState();
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
    if (x402State.ready) {
      return true;
    }

    if (x402State.initPromise) {
      return x402State.initPromise;
    }

    x402State.initPromise = (async () => {
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
      } finally {
        x402State.initPromise = null;
      }
    })();

    return x402State.initPromise;
  }

  app.use(express.json());

  app.use((req, res, next) => {
    if (req.method === "POST" && req.path === "/v1/campaigns") {
      try {
        req.agentdropCampaign = normalizeCampaignRequest(
          req.body || {},
          config.campaignPolicy
        );
        assertBudgetAvailable(
          req.agentdropCampaign,
          budgetState
        );
      } catch (error) {
        next(error);
        return;
      }

      initializeX402()
        .then((ready) => {
          if (!ready) {
            res.status(503).json({
              ok: false,
              error: {
                code: "X402_UNAVAILABLE",
                name: "Error",
                message:
                  "x402 is unavailable because the facilitator could not be reached.",
                ...(x402State.initError
                  ? { details: x402State.initError }
                  : {}),
              },
            });
            return;
          }

          paidMiddleware(req, res, next);
        })
        .catch(next);
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
    const isHealthy = x402State.ready;
    const payload = {
      ok: true,
      service: APP_NAME,
      status: isHealthy ? "healthy" : "degraded",
      accountAddress: config.accountAddress,
      x402Network: config.x402Network,
      x402Ready: x402State.ready,
      ...(x402State.initError
        ? { x402InitError: x402State.initError.message }
        : {}),
    };

    res.status(isHealthy ? 200 : 503).json(payload);
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
      policy: buildPolicySnapshot(config.campaignPolicy, budgetState),
      exampleRequest: {
        amount: "0.00001",
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
      policy: buildPolicySnapshot(config.campaignPolicy, budgetState),
      notes: [
        "The x402 payment covers campaign creation.",
        "The claimable credit itself is funded by the service operator via the configured wallet.",
        "If x402 is unavailable, the paid route returns 503 until the facilitator is reachable.",
      ],
    });
  });

  app.post("/v1/campaigns", async (req, res, next) => {
    let budgetReserved = false;
    let body;
    try {
      body = req.agentdropCampaign || normalizeCampaignRequest(
        req.body || {},
        config.campaignPolicy
      );
      reserveBudget(body, budgetState);
      budgetReserved = true;
      const result = await sendClaimableTransfer({
        amount: body.amount,
        token: body.token,
        chain: body.chain,
      });
      finalizeBudgetSpend(body, budgetState);
      budgetReserved = false;

      res.json({
        ok: true,
        product: "agentdrop_onboarding_credit",
        request: {
          campaign: body.campaign,
          recipientType: body.recipientType,
          amount: body.amount,
          token: body.token,
          chain: body.chain,
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
      if (budgetReserved && body) {
        releaseBudgetReservation(body, budgetState);
      }
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
