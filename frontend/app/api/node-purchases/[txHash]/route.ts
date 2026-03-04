import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { txHash: string } }) {
  try {
    const txHash = String(params.txHash || "").trim().toLowerCase();

    if (!txHash) {
      return NextResponse.json({ error: "txHash is required" }, { status: 400 });
    }

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "NodePurchaseTransaction" WHERE txHash = ? LIMIT 1`,
      txHash,
    )) as any[];

    const nodePurchaseTransaction = rows[0];

    if (!nodePurchaseTransaction) {
      return NextResponse.json({ error: "Node purchase transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ nodePurchaseTransaction });
  } catch (error: any) {
    console.error("Failed to fetch node purchase transaction:", error);
    return NextResponse.json(
      { error: "Failed to fetch node purchase transaction", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}
