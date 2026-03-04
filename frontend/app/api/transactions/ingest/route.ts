import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type TxStatus = "PENDING" | "CONFIRMED" | "FAILED";
type TxType = "X402_PAYMENT" | "SWAP";

function normalizeStatus(status?: string): TxStatus {
  const value = (status || "PENDING").toUpperCase();
  if (value === "CONFIRMED" || value === "FAILED" || value === "PENDING") {
    return value;
  }
  return "PENDING";
}

function normalizeType(txType?: string): TxType | null {
  const value = (txType || "").toUpperCase();
  if (value === "X402_PAYMENT" || value === "SWAP") {
    return value;
  }
  return null;
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
    const txType = normalizeType(body?.txType);

    if (!txHash || !txType) {
      return NextResponse.json(
        {
          error: "Missing or invalid required fields",
          required: {
            txHash: "0x...",
            txType: "X402_PAYMENT | SWAP",
          },
        },
        { status: 400 },
      );
    }

    const status = normalizeStatus(body?.status);
    const createdAt = parseDate(body?.timestamp);
    const confirmedAt = parseDate(body?.confirmedAt) || (status === "CONFIRMED" ? new Date() : undefined);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "Transaction" (
        id, txHash, txType, status, tokenIn, tokenOut, amountIn, amountOut, amountUsd,
        priceImpact, chainId, network, blockNumber, fromAddress, toAddress, nodeId,
        nodeName, dataType, metadata, createdAt, updatedAt, confirmedAt
      ) VALUES (
        lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(txHash) DO UPDATE SET
        txType=excluded.txType,
        status=excluded.status,
        tokenIn=excluded.tokenIn,
        tokenOut=excluded.tokenOut,
        amountIn=excluded.amountIn,
        amountOut=excluded.amountOut,
        amountUsd=excluded.amountUsd,
        priceImpact=excluded.priceImpact,
        chainId=excluded.chainId,
        network=excluded.network,
        blockNumber=excluded.blockNumber,
        fromAddress=excluded.fromAddress,
        toAddress=excluded.toAddress,
        nodeId=excluded.nodeId,
        nodeName=excluded.nodeName,
        dataType=excluded.dataType,
        metadata=excluded.metadata,
        updatedAt=excluded.updatedAt,
        confirmedAt=excluded.confirmedAt`,
      txHash,
      txType,
      status,
      body?.tokenIn ?? null,
      body?.tokenOut ?? null,
      body?.amountIn != null ? Number(body.amountIn) : null,
      body?.amountOut != null ? Number(body.amountOut) : null,
      body?.amountUsd != null ? Number(body.amountUsd) : null,
      body?.priceImpact != null ? Number(body.priceImpact) : null,
      body?.chainId != null ? Number(body.chainId) : null,
      body?.network ?? null,
      body?.blockNumber != null ? Number(body.blockNumber) : null,
      body?.fromAddress ?? null,
      body?.toAddress ?? null,
      body?.nodeId ?? null,
      body?.nodeName ?? null,
      body?.dataType ?? null,
      body?.metadata != null ? JSON.stringify(body.metadata) : null,
      createdAt?.toISOString() ?? new Date().toISOString(),
      new Date().toISOString(),
      confirmedAt?.toISOString() ?? null,
    );

    if (txType === "X402_PAYMENT" && body?.nodeName && body?.amountIn != null) {
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
        String(body.nodeName),
        Number(body.amountIn),
        createdAt?.toISOString() ?? new Date().toISOString(),
        body?.nodeId ?? null,
        status,
        body?.toAddress ?? null,
        body?.metadata != null ? JSON.stringify(body.metadata) : null,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }

    const txRows = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "Transaction" WHERE txHash = ? LIMIT 1`,
      txHash,
    )) as any[];

    return NextResponse.json({ ok: true, transaction: txRows[0] ?? null });
  } catch (error: any) {
    console.error("Transaction ingest failed:", error);
    return NextResponse.json(
      { error: "Failed to ingest transaction", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/transactions/ingest",
    method: "POST",
    required: ["txHash", "txType"],
    txType: ["X402_PAYMENT", "SWAP"],
    status: ["PENDING", "CONFIRMED", "FAILED"],
  });
}
