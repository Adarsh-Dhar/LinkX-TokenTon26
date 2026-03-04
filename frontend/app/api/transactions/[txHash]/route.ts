import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { txHash: string } }) {
  try {
    const db = prisma as any;
    const txHash = String(params.txHash || "").trim().toLowerCase();
    if (!txHash) {
      return NextResponse.json({ error: "txHash is required" }, { status: 400 });
    }

    const tx = await db.transaction.findUnique({
      where: { txHash },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ transaction: tx });
  } catch (error: any) {
    console.error("Failed to fetch transaction:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}
