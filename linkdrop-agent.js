#!/usr/bin/env node
/*
Usage:
  Required env:
    PRIVATE_KEY=0x...
    LINKDROP_API_KEY=zpka_...
  Optional env:
    RPC_URL=...
    RPC_URL_POLYGON=...
    RPC_URL_BASE=...
    RPC_URL_ARBITRUM=...
    RPC_URL_OPTIMISM=...
    RPC_URL_AVALANCHE=...
    LINKDROP_BASE_URL=https://p2p.linkdrop.io
    LINKDROP_API_URL=https://escrow-api.linkdrop.io/v3

	  Commands:
	    node linkdrop-agent.js send --amount 0.01 [--token native|0xToken] [--chain polygon|base|arbitrum|optimism|avalanche]
	    node linkdrop-agent.js claim --url "<claimUrl>" --to 0xRecipient [--chain polygon|base|arbitrum|optimism|avalanche]
	    Default chain: base

  Positional fallback:
    node linkdrop-agent.js send <amount> [token] [chain]
    node linkdrop-agent.js claim <claimUrl> <to> [chain]
*/

const crypto = require("node:crypto");
const { LinkdropSDK } = require("linkdrop-sdk");
const {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  isAddress,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { polygon, base, arbitrum, optimism, avalanche } = require("viem/chains");

const USAGE = [
  "linkdrop-agent.js",
	  "Commands:",
	  "  send --amount <decimal> [--token <native|0xERC20>] [--chain <polygon|base|arbitrum|optimism|avalanche>]",
	  "  claim --url <claimUrl> --to <0xAddress> [--chain <polygon|base|arbitrum|optimism|avalanche>]",
	  "  default chain: base",
  "Positional fallback:",
  "  send <amount> [token] [chain]",
  "  claim <claimUrl> <to> [chain]",
  "Required env:",
  "  PRIVATE_KEY, LINKDROP_API_KEY",
].join("\n");

const CHAIN_CONFIG = {
  polygon: { chain: polygon, chainId: 137 },
  base: { chain: base, chainId: 8453 },
  arbitrum: { chain: arbitrum, chainId: 42161 },
  optimism: { chain: optimism, chainId: 10 },
  avalanche: { chain: avalanche, chainId: 43114 },
};

const ERC20_DECIMALS_ABI = [
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

let printed = false;

function printJson(payload) {
  if (printed) {
    return;
  }
  printed = true;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function serializeError(error) {
  if (error instanceof Error) {
    const details = {};
    if (Object.prototype.hasOwnProperty.call(error, "code")) {
      details.code = error.code;
    }
    if (Object.prototype.hasOwnProperty.call(error, "shortMessage")) {
      details.shortMessage = error.shortMessage;
    }
    if (Object.prototype.hasOwnProperty.call(error, "details")) {
      details.details = error.details;
    }
    if (Object.prototype.hasOwnProperty.call(error, "cause")) {
      details.cause = String(error.cause);
    }
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      ...(Object.keys(details).length ? { details } : {}),
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : JSON.stringify(error),
  };
}

function fail(error, code) {
  const serialized = serializeError(error);
  printJson({
    ok: false,
    error: {
      code: code || serialized.details?.code || "UNKNOWN_ERROR",
      ...serialized,
    },
  });
  process.exitCode = 1;
}

process.on("unhandledRejection", (reason) => {
  fail(reason, "UNHANDLED_REJECTION");
});

process.on("uncaughtException", (error) => {
  fail(error, "UNCAUGHT_EXCEPTION");
});

function parseArgv(args) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    if (withoutPrefix.length === 0) {
      continue;
    }

    const eqIndex = withoutPrefix.indexOf("=");
    if (eqIndex >= 0) {
      const key = withoutPrefix.slice(0, eqIndex);
      const value = withoutPrefix.slice(eqIndex + 1);
      flags[key] = value;
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags[withoutPrefix] = next;
      index += 1;
    } else {
      flags[withoutPrefix] = true;
    }
  }

  return { flags, positionals };
}

function normalizePrivateKey(rawPrivateKey) {
  if (!rawPrivateKey || typeof rawPrivateKey !== "string") {
    throw new Error("Missing PRIVATE_KEY");
  }

  const withPrefix = rawPrivateKey.startsWith("0x")
    ? rawPrivateKey
    : `0x${rawPrivateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error("Invalid PRIVATE_KEY format. Expected 32-byte hex.");
  }

  return withPrefix.toLowerCase();
}

function getValidatedEnv() {
  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  const apiKey = process.env.LINKDROP_API_KEY;

  if (!apiKey) {
    throw new Error("Missing LINKDROP_API_KEY");
  }
  if (!apiKey.startsWith("zpka_")) {
    throw new Error("Invalid LINKDROP_API_KEY format. Expected prefix 'zpka_'.");
  }

  return { privateKey, apiKey };
}

	function resolveChain(chainNameInput) {
	  const chainName = (chainNameInput || "base").toLowerCase();
	  const resolved = CHAIN_CONFIG[chainName];
	  if (!resolved) {
	    throw new Error(
	      `Unsupported chain '${chainNameInput}'. Allowed: polygon, base, arbitrum, optimism, avalanche.`
	    );
	  }
	  return { chainName, ...resolved };
	}

function createClients({ chainName, chain, privateKey }) {
  const chainRpcEnvKey = `RPC_URL_${chainName.toUpperCase()}`;
  const rpcUrl =
    process.env[chainRpcEnvKey] ||
    process.env.RPC_URL ||
    (chain.rpcUrls.default.http && chain.rpcUrls.default.http[0]);

  if (!rpcUrl) {
    throw new Error(`No RPC URL available for chain '${chainName}'.`);
  }

  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  return { account, publicClient, walletClient };
}

function createSdk(apiKey) {
  const sdkConfig = {
    apiKey,
    baseUrl: process.env.LINKDROP_BASE_URL || "https://p2p.linkdrop.io",
    getRandomBytes: (length) => crypto.randomBytes(length),
  };
  if (process.env.LINKDROP_API_URL) {
    sdkConfig.apiUrl = process.env.LINKDROP_API_URL;
  }
  return new LinkdropSDK(sdkConfig);
}

function toBigIntOrUndefined(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (value.trim() === "") {
      return undefined;
    }
    return BigInt(value);
  }
  return undefined;
}

function createSendTransactionWrapper({ walletClient, account }) {
  return async (tx) => {
    const request = tx || {};
    if (!request.to) {
      throw new Error("sendTransaction requires 'to'");
    }

    const hash = await walletClient.sendTransaction({
      account,
      to: request.to,
      data: request.data || "0x",
      value: toBigIntOrUndefined(request.value),
      gas: toBigIntOrUndefined(request.gas),
      nonce:
        request.nonce !== undefined && request.nonce !== null
          ? Number(request.nonce)
          : undefined,
      maxFeePerGas: toBigIntOrUndefined(request.maxFeePerGas),
      maxPriorityFeePerGas: toBigIntOrUndefined(request.maxPriorityFeePerGas),
    });

    return { hash, type: "tx" };
  };
}

async function parseAmountAtomic({ amountInput, tokenInput, publicClient }) {
  if (!amountInput) {
    throw new Error("Missing amount. Use --amount <decimal>.");
  }

  const normalizedToken = (tokenInput || "native").toLowerCase();
  if (normalizedToken === "native") {
    return {
      tokenType: "NATIVE",
      tokenAddress: undefined,
      atomicAmount: parseEther(amountInput).toString(),
    };
  }

  if (!isAddress(tokenInput)) {
    throw new Error("Invalid ERC20 token address.");
  }

  const decimalsRaw = await publicClient.readContract({
    address: tokenInput,
    abi: ERC20_DECIMALS_ABI,
    functionName: "decimals",
  });

  const decimals = Number(decimalsRaw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Invalid ERC20 decimals value.");
  }

  return {
    tokenType: "ERC20",
    tokenAddress: tokenInput.toLowerCase(),
    atomicAmount: parseUnits(amountInput, decimals).toString(),
  };
}

function getHelpPayload() {
  return {
    ok: true,
    usage: USAGE,
	    examples: [
	      "node linkdrop-agent.js send --amount 0.01 --token native --chain base",
	      "node linkdrop-agent.js send --amount 5 --token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --chain polygon",
	      "node linkdrop-agent.js claim --url \"https://...\" --to 0x000000000000000000000000000000000000dead --chain base",
	    ],
	  };
	}

	async function runSendCommand(parsed, sdk, env) {
	  const amountInput = parsed.flags.amount || parsed.positionals[0];
	  const tokenInput = parsed.flags.token || parsed.positionals[1] || "native";
	  const chainInput = parsed.flags.chain || parsed.positionals[2] || "base";

  const { chainName, chain, chainId } = resolveChain(chainInput);
  const { account, publicClient, walletClient } = createClients({
    chainName,
    chain,
    privateKey: env.privateKey,
  });

  const { tokenType, tokenAddress, atomicAmount } = await parseAmountAtomic({
    amountInput,
    tokenInput,
    publicClient,
  });

  const claimLink = await sdk.createClaimLink({
    from: account.address,
    chainId,
    tokenType,
    token: tokenAddress,
    amount: atomicAmount,
  });

  const sendTransaction = createSendTransactionWrapper({ walletClient, account });
  const depositResult = await claimLink.deposit({ sendTransaction });

  return {
    ok: true,
    claimUrl: depositResult.claimUrl || claimLink.claimUrl,
    transferId: depositResult.transferId || claimLink.transferId,
    depositTx: depositResult.hash,
  };
}

	async function runClaimCommand(parsed, sdk, env) {
	  const claimUrl = parsed.flags.url || parsed.positionals[0];
	  const destination = parsed.flags.to || parsed.positionals[1];
	  const chainInput = parsed.flags.chain || parsed.positionals[2] || "base";

  resolveChain(chainInput);

  if (!claimUrl || typeof claimUrl !== "string") {
    throw new Error("Missing claim URL. Use --url <claimUrl>.");
  }
  if (!destination || !isAddress(destination)) {
    throw new Error("Invalid destination address. Use --to <0xAddress>.");
  }

  normalizePrivateKey(env.privateKey);

  const claimLink = await sdk.getClaimLink(claimUrl);
  const redeemTx = await claimLink.redeem(destination);

  return {
    ok: true,
    redeemTx,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv[0] === "help") {
    printJson(getHelpPayload());
    return;
  }

  const command = String(argv[0]).toLowerCase();
  const parsed = parseArgv(argv.slice(1));
  const env = getValidatedEnv();
  const sdk = createSdk(env.apiKey);

  if (command === "send") {
    const result = await runSendCommand(parsed, sdk, env);
    printJson(result);
    return;
  }

  if (command === "claim") {
    const result = await runClaimCommand(parsed, sdk, env);
    printJson(result);
    return;
  }

  throw new Error(`Unknown command '${command}'. Use 'send' or 'claim'.`);
}

main().catch((error) => {
  fail(error);
});
