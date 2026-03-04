import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeStatus(status?: string): "PENDING" | "CONFIRMED" | "FAILED" {
  const value = (status || "CONFIRMED").toUpperCase();
  if (value === "PENDING" || value === "CONFIRMED" || value === "FAILED") {
    return value;
  }
  return "CONFIRMED";
}

function parseDate(input?: string): Date | undefined {
  if (!input) return undefined;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const txHash = String(body?.txHash || "").trim().toLowerCase();
    const nodeName = String(body?.nodeName || "").trim();
    const pricePaid = body?.pricePaid != null ? Number(body.pricePaid) : NaN;

    if (!txHash || !nodeName || Number.isNaN(pricePaid)) {
      return NextResponse.json(
        {
          error: "Missing or invalid required fields",
          required: {
            txHash: "0x...",
            nodeName: "Market Microstructure & Execution",
            pricePaid: "number",
          },
        },
        { status: 400 },
      );
    }

    const timestamp = parseDate(body?.timestamp);
    const status = normalizeStatus(body?.status);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "NodePurchaseTransaction" (
        id, txHash, nodeName, pricePaid, timestamp, nodeId, status, toAddress, metadata, createdAt, updatedAt
      ) VALUES (
        lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(txHash) DO UPDATE SET
        nodeName=excluded.nodeName,
        pricePaid=excluded.pricePaid,
        timestamp=excluded.timestamp,
        nodeId=excluded.nodeId,
        status=excluded.status,
        toAddress=excluded.toAddress,
        metadata=excluded.metadata,
        updatedAt=excluded.updatedAt`,
      txHash,
      nodeName,
      pricePaid,
      timestamp?.toISOString() ?? new Date().toISOString(),
      body?.nodeId ?? null,
      status,
      body?.toAddress ?? null,
      body?.metadata != null ? JSON.stringify(body.metadata) : null,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "NodePurchaseTransaction" WHERE txHash = ? LIMIT 1`,
      txHash,
    )) as any[];

    return NextResponse.json({ ok: true, nodePurchaseTransaction: rows[0] ?? null });
  } catch (error: any) {
    console.error("Node purchase ingest failed:", error);
    return NextResponse.json(
      { error: "Failed to ingest node purchase transaction", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/node-purchases/ingest",
    method: "POST",
    required: ["txHash", "nodeName", "pricePaid"],
    status: ["PENDING", "CONFIRMED", "FAILED"],
  });
}
