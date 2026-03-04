import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

const DEFAULT_WRAPPED_SOL_ADDRESS = "0xC02aaA39b223FE8D0A0e8e4F27ead9083C756Cc2";
const DEFAULT_USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
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

async function getWalletBalances() {
  try {
    ensureEnvLoaded();
    const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
    const walletPrivateKey = normalizePrivateKey(process.env.WALLET_PRIVATE_KEY);
    const wrappedSolContractAddress =
      process.env.WRAPPED_SOL_CONTRACT ||
      process.env.WRAPPED_SOL_ADDRESS ||
      process.env.NEXT_PUBLIC_WRAPPED_SOL_ADDRESS ||
      process.env.NEXT_PUBLIC_TEST_WRAPPED_SOL_ADDRESS ||
      DEFAULT_WRAPPED_SOL_ADDRESS;
    const usdcContractAddress =
      process.env.USDC_CONTRACT ||
      process.env.USDC_ADDRESS ||
      process.env.NEXT_PUBLIC_USDC_CONTRACT ||
      DEFAULT_USDC_ADDRESS;

    if (!walletPrivateKey || !wrappedSolContractAddress || !usdcContractAddress) {
      console.warn("Missing Solana blockchain config, falling back to DB snapshot");
      return null;
    }

    // Create provider and signer
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(walletPrivateKey, provider);
    const walletAddress = signer.address;

    // Create contract instances
    const wrappedSolContract = new ethers.Contract(ethers.getAddress(wrappedSolContractAddress), ERC20_ABI, provider);
    const usdcContract = new ethers.Contract(ethers.getAddress(usdcContractAddress), ERC20_ABI, provider);

    // Fetch balances and decimals in parallel
    const [wrappedSolBalanceRaw, usdcBalanceRaw, wrappedSolDecimals, usdcDecimals] = await Promise.all([
      wrappedSolContract.balanceOf(walletAddress),
      usdcContract.balanceOf(walletAddress),
      wrappedSolContract.decimals(),
      usdcContract.decimals(),
    ]);

    // Convert from wei/base units to human-readable
    const wrappedSolBalance = parseFloat(ethers.formatUnits(wrappedSolBalanceRaw, wrappedSolDecimals));
    const usdcBalance = parseFloat(ethers.formatUnits(usdcBalanceRaw, usdcDecimals));

    return {
      wrappedSolBalance,
      usdcBalance,
      walletAddress,
    };
  } catch (error) {
    console.error("Error fetching blockchain balances:", error);
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const db = prisma as any;

    const safe = async <T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        console.warn(`[dashboard/stats] Failed ${label}:`, error);
        return fallback;
      }
    };

    // 1. Fetch trade metrics with safe fallbacks
    const [totalTrades, winCount, tradeStats] = await Promise.all([
      safe(() => prisma.trade.count(), 0, "trade count"),
      safe(() => prisma.trade.count({ where: { isWin: true } }), 0, "win count"),
      safe(
        () =>
          prisma.trade.aggregate({
            _sum: {
              realizedPnL: true,
            },
            _avg: {
              confidence: true,
            },
          }),
        {
          _sum: { realizedPnL: 0 },
          _avg: { confidence: 0 },
        },
        "trade aggregates"
      ),
    ]);

    // 3. Count today's x402 purchases / swaps from transaction ledger
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [alphaCount, swapTxToday, txToday] = await Promise.all([
      safe(
        async () => {
          const rows = (await prisma.$queryRawUnsafe(
            'SELECT COUNT(*) as count FROM "NodePurchaseTransaction"'
          )) as Array<{ count: number | string | bigint }>;

          const rawCount = rows?.[0]?.count ?? 0;
          const parsedCount = Number(rawCount);
          if (Number.isFinite(parsedCount)) {
            return parsedCount;
          }

          if (db?.transaction?.count) {
            return db.transaction.count({
              where: {
                txType: "X402_PAYMENT",
              },
            });
          }

          return 0;
        },
        0,
        "total alpha purchased count"
      ),
      safe(
        async () =>
          db?.transaction?.count
            ? db.transaction.count({
                where: {
                  txType: "SWAP",
                  createdAt: {
                    gte: startOfToday,
                  },
                },
              })
            : 0,
        0,
        "swap transaction count"
      ),
      safe(
        async () =>
          db?.transaction?.count
            ? db.transaction.count({
                where: {
                  createdAt: {
                    gte: startOfToday,
                  },
                },
              })
            : 0,
        0,
        "today transaction count"
      ),
    ]);

    // 4. Calculate Win Rate
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

    // 5. Try to get real balances from blockchain first, fall back to DB snapshot
    let wrappedSolBalance = 0;
    let usdcBalance = 0;
    let currentBalanceUsd = 0;

    const blockchainBalances = await getWalletBalances();
    if (blockchainBalances) {
      wrappedSolBalance = blockchainBalances.wrappedSolBalance;
      usdcBalance = blockchainBalances.usdcBalance;
      // Estimate USD value (simple: USDC is $1, Wrapped SOL needs market price)
      // For now, just use USDC as the primary USD value
      currentBalanceUsd = usdcBalance;
    } else {
      // Fallback to DB snapshot if blockchain fetch fails
      const latestSnapshot = await safe(
        () =>
          prisma.portfolioSnapshot.findFirst({
            orderBy: { timestamp: "desc" },
          }),
        null,
        "latest portfolio snapshot"
      );
      wrappedSolBalance = latestSnapshot?.wrappedSolBalance || 0;
      usdcBalance = latestSnapshot?.usdcBalance || 0;
      currentBalanceUsd = latestSnapshot?.totalValueUsd || 0;
    }

    // 6. Calculate Percentage Growth (Simple Estimate)
    // (Total PnL / (Current Balance - Total PnL)) * 100
    const totalPnL = tradeStats._sum?.realizedPnL || 0;
    const startingCapital = currentBalanceUsd - totalPnL;
    
    let profitPercent = 0;
    if (startingCapital > 0) {
      profitPercent = (totalPnL / startingCapital) * 100;
    }

    return NextResponse.json({
      wrappedSolBalance,
      usdcBalance,
      walletBalanceUsd: currentBalanceUsd,
      alphaPurchased: alphaCount,
      swapTxToday,
      txToday,
      totalPnL: totalPnL,
      profitPercent: profitPercent,
      winRate: winRate,
      totalTrades: totalTrades,
      avgConfidence: (tradeStats._avg?.confidence || 0) * 100, // Convert 0.85 to 85.0
    });

  } catch (error) {
    console.error("Stats API Error:", error);
    const blockchainBalances = await getWalletBalances();
    return NextResponse.json({
      wrappedSolBalance: blockchainBalances?.wrappedSolBalance || 0,
      usdcBalance: blockchainBalances?.usdcBalance || 0,
      walletBalanceUsd: blockchainBalances?.usdcBalance || 0,
      alphaPurchased: 0,
      swapTxToday: 0,
      txToday: 0,
      totalPnL: 0,
      profitPercent: 0,
      winRate: 0,
      totalTrades: 0,
      avgConfidence: 0,
    });
  }
}