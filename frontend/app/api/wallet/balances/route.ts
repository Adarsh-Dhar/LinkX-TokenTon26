import { NextResponse } from "next/server";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
// import { solanaDevnet } from "thirdweb/chains"; // Using Solana Devnet

// Solana Devnet addresses (replace with actual deployed contract addresses if needed)
const DEFAULT_WRAPPED_SOL_ADDRESS = "0xC02aaA39b223FE8D0A0e8e4F27ead9083C756Cc2"; // Example Wrapped SOL
const DEFAULT_USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Example USDC
const SOLANA_CHAIN_ID = 103; // Solana Devnet
const SOLANA_RPC_URL = "https://api.devnet.solana.com";
const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

let envLoaded = false;

function ensureEnvLoaded() {
  if (envLoaded) return;
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../agent/.env") });
  envLoaded = true;
}

function normalizePrivateKey(pk?: string | null): string | null {
  if (!pk) return null;
  const trimmed = pk.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export async function GET() {
  try {
    ensureEnvLoaded();

    const privateKey = normalizePrivateKey(process.env.WALLET_PRIVATE_KEY);
    if (!privateKey) {
      console.error("[balances API] WALLET_PRIVATE_KEY not set in environment variables");
      return NextResponse.json({ error: "WALLET_PRIVATE_KEY not configured" }, { status: 500 });
    }

    const signer = new ethers.Wallet(privateKey);
    const walletAddress = signer.address;

    // Use Solana Devnet RPC and chainId
    const rpcUrl = SOLANA_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl, SOLANA_CHAIN_ID);

    // Use checksummed addresses from ethers.getAddress() for proper EIP55 validation
    const wrappedSolAddress = ethers.getAddress(
      process.env.WRAPPED_SOL_CONTRACT ||
      process.env.WRAPPED_SOL_ADDRESS ||
      process.env.NEXT_PUBLIC_WRAPPED_SOL_ADDRESS ||
      process.env.NEXT_PUBLIC_TEST_WRAPPED_SOL_ADDRESS ||
      DEFAULT_WRAPPED_SOL_ADDRESS
    );
    const usdcAddress = ethers.getAddress(
      process.env.USDC_CONTRACT ||
      process.env.USDC_ADDRESS ||
      process.env.NEXT_PUBLIC_USDC_CONTRACT ||
      DEFAULT_USDC_ADDRESS
    );

    // Debug logs
    console.log("[balances API] rpcUrl:", rpcUrl);
    console.log("[balances API] wrappedSolAddress:", wrappedSolAddress);
    console.log("[balances API] usdcAddress:", usdcAddress);

    // Check if contract code exists at each address
    const [wrappedSolCode, usdcCode] = await Promise.all([
      provider.getCode(wrappedSolAddress),
      provider.getCode(usdcAddress),
    ]);
    if (wrappedSolCode === "0x") {
      console.error(`[balances API] No contract deployed at wrappedSolAddress: ${wrappedSolAddress}`);
      // Return zero balances instead of error to prevent UI from breaking
      return NextResponse.json({
        address: walletAddress,
        wrappedSolBalance: 0,
        usdcBalance: 0,
        tokens: { wrappedSol: wrappedSolAddress, usdc: usdcAddress },
        warning: `No Wrapped SOL contract at ${wrappedSolAddress}`,
      });
    }
    if (usdcCode === "0x") {
      console.error(`[balances API] No contract deployed at usdcAddress: ${usdcAddress}`);
      // Return zero balances instead of error to prevent UI from breaking
      return NextResponse.json({
        address: walletAddress,
        wrappedSolBalance: 0,
        usdcBalance: 0,
        tokens: { wrappedSol: wrappedSolAddress, usdc: usdcAddress },
        warning: `No USDC contract at ${usdcAddress}`,
      });
    }

    const wrappedSolContract = new ethers.Contract(wrappedSolAddress, ERC20_ABI, provider);
    const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);

    const safeDecimals = async (contract: ethers.Contract, fallback: number) => {
      try {
        return await contract.decimals();
      } catch (err) {
        console.warn(`Failed to get decimals for ${await contract.getAddress()}:`, err);
        return fallback;
      }
    };

    const safeBalance = async (contract: ethers.Contract, address: string) => {
      try {
        return await contract.balanceOf(address);
      } catch (err) {
        console.warn(`Failed to get balance of ${address} for ${await contract.getAddress()}:`, err);
        return BigInt(0);
      }
    };

    const [
      wrappedSolBalanceRaw,
      wrappedSolDecimals,
      usdcBalanceRaw,
      usdcDecimals,
    ] = await Promise.all([
      safeBalance(wrappedSolContract, walletAddress),
      safeDecimals(wrappedSolContract, 18),
      safeBalance(usdcContract, walletAddress),
      safeDecimals(usdcContract, 6),
    ]);

    const wrappedSolBalance = parseFloat(ethers.formatUnits(wrappedSolBalanceRaw, wrappedSolDecimals));
    const usdcBalance = parseFloat(ethers.formatUnits(usdcBalanceRaw, usdcDecimals));

    return NextResponse.json({
      address: walletAddress,
      wrappedSolBalance,
      usdcBalance,
      chainId: SOLANA_CHAIN_ID,
      symbol: "WRAPPED_SOL",
      tokens: {
        wrappedSol: wrappedSolAddress,
        usdc: usdcAddress,
      }
    });
  } catch (error) {
    console.error("Solana wallet balances API error:", error);
    // Return zero balances with error details instead of throwing
    return NextResponse.json({
      address: null,
      wrappedSolBalance: 0,
      usdcBalance: 0,
      chainId: SOLANA_CHAIN_ID,
      symbol: "WRAPPED_SOL",
      error: "Failed to fetch Solana wallet balances",
      details: String(error),
    }, { status: 200 }); // Return 200 with error details to prevent UI crash
  }
}
