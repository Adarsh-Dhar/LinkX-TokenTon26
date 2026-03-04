import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const db = prisma as any;
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const start = fromParam ? new Date(fromParam) : new Date(new Date().setUTCHours(0, 0, 0, 0));
    const end = toParam ? new Date(toParam) : new Date();

    const where = {
      createdAt: {
        gte: Number.isNaN(start.getTime()) ? new Date(new Date().setUTCHours(0, 0, 0, 0)) : start,
        lte: Number.isNaN(end.getTime()) ? new Date() : end,
      },
    };

    const [
      totalCount,
      x402Count,
      swapCount,
      pendingCount,
      confirmedCount,
      failedCount,
      x402Spend,
    ] = await Promise.all([
      db.transaction.count({ where }),
      db.transaction.count({ where: { ...where, txType: "X402_PAYMENT" } }),
      db.transaction.count({ where: { ...where, txType: "SWAP" } }),
      db.transaction.count({ where: { ...where, status: "PENDING" } }),
      db.transaction.count({ where: { ...where, status: "CONFIRMED" } }),
      db.transaction.count({ where: { ...where, status: "FAILED" } }),
      db.transaction.aggregate({
        where: { ...where, txType: "X402_PAYMENT", tokenIn: "USDC" },
        _sum: { amountIn: true },
      }),
    ]);

    return NextResponse.json({
      range: {
        from: where.createdAt.gte,
        to: where.createdAt.lte,
      },
      totalCount,
      byType: {
        x402Payment: x402Count,
        swap: swapCount,
      },
      byStatus: {
        pending: pendingCount,
        confirmed: confirmedCount,
        failed: failedCount,
      },
      totals: {
        x402UsdcSpent: x402Spend._sum.amountIn || 0,
      },
    });
  } catch (error: any) {
    console.error("Failed to build transaction summary:", error);
    return NextResponse.json(
      { error: "Failed to build transaction summary", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}
