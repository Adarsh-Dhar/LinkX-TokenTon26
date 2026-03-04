import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const trades = await prisma.trade.findMany({
      orderBy: { timestamp: "desc" },
      take: 10,
    });

    // Format for frontend display
    const formattedTrades = trades.map((t: { id: any; tokenIn: any; tokenOut: any; amountIn: any; realizedPnL: any; status: any; timestamp: any; txHash: any; }) => ({
      id: t.id,
      pair: `${t.tokenIn}/${t.tokenOut}`,
      type: "SWAP",
      amount: `${t.amountIn} ${t.tokenIn}`,
      pnl: t.realizedPnL,
      status: t.status,
      timestamp: t.timestamp,
      txHash: t.txHash,
    }));

    return NextResponse.json(formattedTrades);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}