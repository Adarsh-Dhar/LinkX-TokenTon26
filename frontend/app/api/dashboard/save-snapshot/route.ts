import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { wrappedSolBalance, usdcBalance, wrappedSolPrice } = await request.json();

    if (typeof wrappedSolBalance !== 'number' || typeof usdcBalance !== 'number') {
      return NextResponse.json(
        { error: "Invalid balance values" },
        { status: 400 }
      );
    }

    // Get Wrapped SOL/USDC price from price endpoint if not provided
    let currentPrice = wrappedSolPrice;
    if (!currentPrice) {
      try {
        const priceRes = await fetch("http://localhost:3050/market/price/SOL-USDC", {
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          currentPrice = priceData.price || 0.06; // fallback price
        }
      } catch (error) {
        console.warn("Could not fetch real-time price, using fallback:", error);
        currentPrice = 0.06; // fallback price
      }
    }

    // Calculate total portfolio value in USD
    // totalValueUsd = (wrappedSolBalance * wrappedSolPrice) + usdcBalance
    const totalValueUsd = (wrappedSolBalance * currentPrice) + usdcBalance;

    // Skip saving if we don't have a valid portfolio value
    if (!Number.isFinite(totalValueUsd) || totalValueUsd <= 0) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: "Invalid or zero portfolio value",
      });
    }

    // Create portfolio snapshot
    const snapshot = await prisma.portfolioSnapshot.create({
      data: {
        wrappedSolBalance,
        usdcBalance,
        totalValueUsd,
        timestamp: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      snapshot,
      wrappedSolPrice: currentPrice,
      totalValueUsd,
    });
  } catch (error) {
    console.error("Save Snapshot Error:", error);
    return NextResponse.json(
      { error: "Failed to save portfolio snapshot" },
      { status: 500 }
    );
  }
}
