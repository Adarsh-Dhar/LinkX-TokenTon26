import { NextResponse } from "next/server";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";
import path from "path";

// Solana Devnet addresses - Use actual Solana token mint addresses
const DEFAULT_WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112"; // Wrapped SOL mint
const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14Gbb5hZsgSTKVqfDptdLQbLnkwC3"; // USDC on Devnet
const SOLANA_CLUSTER_URL = "https://api.devnet.solana.com";

let envLoaded = false;

function ensureEnvLoaded() {
  if (envLoaded) return;
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
  dotenv.config({ path: path.resolve(process.cwd(), "../agent/.env") });
  envLoaded = true;
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
      console.warn(`[balances API] Ignoring invalid ${label} mint: ${value}`);
    }
  }
  return new PublicKey(fallback);
}

export async function GET() {
  try {
    ensureEnvLoaded();

    const privateKeyString = process.env.WALLET_PRIVATE_KEY;
    if (!privateKeyString) {
      console.error("[balances API] WALLET_PRIVATE_KEY not set in environment variables");
      return NextResponse.json({ error: "WALLET_PRIVATE_KEY not configured" }, { status: 500 });
    }

    // Parse Solana private key (supports multiple formats)
    let publicKey: PublicKey;
    try {
      const cleanKey = privateKeyString.trim();
      let keypair: Keypair;
      
      // Try parsing as JSON array first (e.g., [1, 2, 3, ...])
      if (cleanKey.startsWith('[')) {
        try {
          const arr = JSON.parse(cleanKey);
          if (Array.isArray(arr) && arr.length === 64) {
            const keyBytes = new Uint8Array(arr);
            keypair = Keypair.fromSecretKey(keyBytes);
          } else {
            throw new Error("Array must contain exactly 64 bytes");
          }
        } catch (e) {
          console.warn("[balances API] Failed to parse as JSON array:", e);
          throw new Error("Invalid JSON array format - expected 64 bytes");
        }
      } 
      // Try hex format (with or without 0x prefix)
      else if (/^(0x)?[0-9a-fA-F]+$/.test(cleanKey)) {
        const hexKey = cleanKey.replace(/^0x/, '');
        if (hexKey.length === 128) {
          // 64 bytes in hex - full keypair
          const keyBytes = Buffer.from(hexKey, 'hex');
          keypair = Keypair.fromSecretKey(new Uint8Array(keyBytes));
        } else if (hexKey.length === 64) {
          // 32 bytes in hex - seed/private key
          // Create keypair from seed using Ed25519
          const seed = Buffer.from(hexKey, 'hex');
          keypair = Keypair.fromSeed(new Uint8Array(seed));
        } else {
          throw new Error(`Invalid hex length: ${hexKey.length} chars (expected 64 or 128)`);
        }
      }
      // Try base58 (standard Solana format - 88 chars for 64 bytes)
      else {
        try {
          const keyBytes = bs58.decode(cleanKey);
          if (keyBytes.length === 64) {
            keypair = Keypair.fromSecretKey(keyBytes);
          } else {
            throw new Error(`Invalid decoded key length: ${keyBytes.length} bytes (expected 64)`);
          }
        } catch (e) {
          console.warn("[balances API] Failed to parse as base58:", e);
          throw new Error(`Invalid private key format. Got ${cleanKey.length} chars. Expected: base58, hex (64 or 128 chars), or JSON array (64 numbers)`);
        }
      }
      
      publicKey = keypair.publicKey;
      console.log("[balances API] Successfully parsed private key");
    } catch (err) {
      console.error("[balances API] Failed to parse private key:", err);
      console.error("[balances API] Key preview:", privateKeyString.substring(0, 50) + "...");
      return NextResponse.json({ error: "Invalid WALLET_PRIVATE_KEY format", details: String(err) }, { status: 500 });
    }

    // Create Solana connection
    const connection = new Connection(SOLANA_CLUSTER_URL, "confirmed");
    const walletAddress = publicKey.toBase58();

    // Get token mint addresses from env or use defaults
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

    // Debug logs
    console.log("[balances API] Solana cluster:", SOLANA_CLUSTER_URL);
    console.log("[balances API] Wallet address:", walletAddress);
    console.log("[balances API] wrappedSolMint:", wrappedSolMint.toBase58());
    console.log("[balances API] usdcMint:", usdcMint.toBase58());

    // Fetch token accounts for this wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: TOKEN_PROGRAM_ID,
    });

    // Helper to get balance for a specific mint
    const getTokenBalance = async (mint: PublicKey): Promise<{ balance: number; decimals: number }> => {
      // Find token account for this mint
      const tokenAccount = tokenAccounts.value.find(
        acc => acc.account.data.parsed.info.mint === mint.toBase58()
      );

      if (!tokenAccount) {
        console.log(`[balances API] No token account found for mint ${mint.toBase58()}`);
        return { balance: 0, decimals: 6 }; // Default to 6 decimals
      }

      try {
        const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
        const mintInfo = await connection.getParsedAccountInfo(mint);
        const mintDecimals = Number(
          (mintInfo.value as any)?.data?.parsed?.info?.decimals ?? tokenAmount?.decimals ?? 6
        );
        const uiAmount = tokenAmount?.uiAmount;
        const uiAmountString = tokenAmount?.uiAmountString;
        const decimals = mintDecimals;

        if (typeof uiAmountString === "string" && uiAmountString.length > 0) {
          return { balance: Number(uiAmountString), decimals };
        }

        if (typeof uiAmount === "number") {
          return { balance: uiAmount, decimals };
        }

        const rawAmount = Number(tokenAmount?.amount ?? 0);
        return {
          balance: rawAmount / Math.pow(10, decimals),
          decimals,
        };
      } catch (err) {
        console.warn(`[balances API] Failed to get balance for mint ${mint.toBase58()}:`, err);
        return { balance: 0, decimals: 6 };
      }
    };

    const [wrappedSolData, usdcData, nativeSolLamports] = await Promise.all([
      getTokenBalance(wrappedSolMint),
      getTokenBalance(usdcMint),
      connection.getBalance(publicKey),
    ]);

    const nativeSolBalance = nativeSolLamports / 1_000_000_000;
    const effectiveWrappedSolBalance =
      wrappedSolData.balance > 0 ? wrappedSolData.balance : nativeSolBalance;

    return NextResponse.json({
      address: walletAddress,
      wrappedSolBalance: effectiveWrappedSolBalance,
      usdcBalance: usdcData.balance,
      chainId: "solana-devnet",
      symbol: "WRAPPED_SOL",
      tokens: {
        wrappedSol: wrappedSolMint.toBase58(),
        usdc: usdcMint.toBase58(),
      }
    });
  } catch (error) {
    console.error("Solana wallet balances API error:", error);
    // Return zero balances with error details instead of throwing
    return NextResponse.json({
      address: null,
      wrappedSolBalance: 0,
      usdcBalance: 0,
      chainId: "solana-devnet",
      symbol: "WRAPPED_SOL",
      error: "Failed to fetch Solana wallet balances",
      details: String(error),
    }, { status: 200 }); // Return 200 with error details to prevent UI crash
  }
}
