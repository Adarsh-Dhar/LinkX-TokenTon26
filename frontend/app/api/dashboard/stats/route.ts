import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import dotenv from "dotenv";
import path from "path";
import bs58 from "bs58";

const DEFAULT_WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14Gbb5hZsgSTKVqfDptdLQbLnkwC3";

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
  return trimmed;
}

function resolveSolanaMint(
  candidates: Array<string | undefined>,
  fallback: string,
  label: string
): PublicKey {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      return new PublicKey(value);
    } catch {
      console.warn(`[dashboard/stats] Ignoring invalid ${label} mint: ${value}`);
    }
  }
  return new PublicKey(fallback);
}

function parseSolanaKeypair(privateKeyString: string): Keypair {
  const cleanKey = privateKeyString.trim();

  if (cleanKey.startsWith("[")) {
    const arr = JSON.parse(cleanKey);
    if (Array.isArray(arr) && arr.length === 64) {
      return Keypair.fromSecretKey(new Uint8Array(arr));
    }
    throw new Error("Invalid JSON private key array length");
  }

  if (/^(0x)?[0-9a-fA-F]+$/.test(cleanKey)) {
    const hexKey = cleanKey.replace(/^0x/, "");
    if (hexKey.length === 128) {
      return Keypair.fromSecretKey(new Uint8Array(Buffer.from(hexKey, "hex")));
    }
    if (hexKey.length === 64) {
      return Keypair.fromSeed(new Uint8Array(Buffer.from(hexKey, "hex")));
    }
    throw new Error("Invalid hex private key length");
  }

  const decoded = bs58.decode(cleanKey);
  if (decoded.length === 64) {
    return Keypair.fromSecretKey(decoded);
  }
  throw new Error("Invalid base58 private key length");
}

async function getWalletBalances() {
  try {
    ensureEnvLoaded();
    const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
    const walletPrivateKey = normalizePrivateKey(process.env.WALLET_PRIVATE_KEY);
    if (!walletPrivateKey) {
      console.warn("Missing Solana blockchain config, falling back to DB snapshot");
      return null;
    }

    const keypair = parseSolanaKeypair(walletPrivateKey);
    const walletPublicKey = keypair.publicKey;
    const wrappedSolMint = resolveSolanaMint(
      [
        process.env.WRAPPED_SOL_MINT,
        process.env.NEXT_PUBLIC_WRAPPED_SOL_MINT,
        process.env.WRAPPED_SOL_ADDRESS,
        process.env.NEXT_PUBLIC_WRAPPED_SOL_ADDRESS,
        process.env.NEXT_PUBLIC_TEST_WRAPPED_SOL_ADDRESS,
        process.env.WRAPPED_SOL_CONTRACT,
      ],
      DEFAULT_WRAPPED_SOL_MINT,
      "WRAPPED_SOL"
    );
    const usdcMint = resolveSolanaMint(
      [
        process.env.USDC_MINT,
        process.env.NEXT_PUBLIC_USDC_MINT,
        process.env.USDC_ADDRESS,
        process.env.NEXT_PUBLIC_USDC_CONTRACT,
        process.env.USDC_CONTRACT,
      ],
      DEFAULT_USDC_MINT,
      "USDC"
    );

    const connection = new Connection(rpcUrl, "confirmed");
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, {
      programId: TOKEN_PROGRAM_ID,
    });

    const getTokenBalance = async (mint: PublicKey): Promise<number> => {
      const tokenAccount = tokenAccounts.value.find(
        (acc) => acc.account.data.parsed.info.mint === mint.toBase58()
      );

      if (!tokenAccount) return 0;

      const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
      const mintInfo = await connection.getParsedAccountInfo(mint);
      const mintDecimals = Number(
        (mintInfo.value as any)?.data?.parsed?.info?.decimals ?? tokenAmount?.decimals ?? 6
      );

      if (typeof tokenAmount?.uiAmountString === "string" && tokenAmount.uiAmountString.length > 0) {
        return Number(tokenAmount.uiAmountString);
      }

      if (typeof tokenAmount?.uiAmount === "number") {
        return tokenAmount.uiAmount;
      }

      const raw = Number(tokenAmount?.amount ?? 0);
      return raw / Math.pow(10, mintDecimals);
    };

    const [wrappedSolTokenBalance, usdcBalance] = await Promise.all([
      getTokenBalance(wrappedSolMint),
      getTokenBalance(usdcMint),
    ]);
    const nativeSolLamports = await connection.getBalance(walletPublicKey);
    const nativeSolBalance = nativeSolLamports / 1_000_000_000;
    const wrappedSolBalance =
      wrappedSolTokenBalance > 0 ? wrappedSolTokenBalance : nativeSolBalance;

    return {
      wrappedSolBalance,
      usdcBalance,
      walletAddress: walletPublicKey.toBase58(),
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