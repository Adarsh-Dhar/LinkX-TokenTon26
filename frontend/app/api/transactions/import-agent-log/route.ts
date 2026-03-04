import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";

type AgentTxLog = {
  x402_payments?: Array<{
    timestamp?: string;
    tx_hash?: string;
    amount_usdc?: number;
    recipient_wallet?: string;
    node_id?: string;
    node_name?: string;
    data_type?: string;
    status?: string;
  }>;
  swaps?: Array<{
    timestamp?: string;
    tx_hash?: string;
    token_in?: string;
    token_out?: string;
    amount_in?: number;
    amount_out?: number;
    price_impact?: number | null;
    status?: string;
  }>;
};

function parseDate(input?: string): Date | undefined {
  if (!input) return undefined;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function normalizeStatus(status?: string): "PENDING" | "CONFIRMED" | "FAILED" {
  const value = (status || "PENDING").toUpperCase();
  if (value === "CONFIRMED" || value === "FAILED" || value === "PENDING") return value;
  return "PENDING";
}

export async function POST() {
  try {
    const txLogPath = process.env.AGENT_TX_LOG_PATH || path.resolve(process.cwd(), "../agent/transaction_log.json");

    const raw = await fs.readFile(txLogPath, "utf8");
    const parsed = JSON.parse(raw) as AgentTxLog;

    const x402 = parsed.x402_payments || [];
    const swaps = parsed.swaps || [];

    let imported = 0;
    let skipped = 0;

    for (const p of x402) {
      const txHash = String(p.tx_hash || "").trim().toLowerCase();
      if (!txHash.startsWith("0x")) {
        skipped += 1;
        continue;
      }
      const status = normalizeStatus(p.status);
      const createdAt = parseDate(p.timestamp);

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
        "X402_PAYMENT",
        status,
        "USDC",
        null,
        p.amount_usdc != null ? Number(p.amount_usdc) : null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        p.recipient_wallet ?? null,
        p.node_id ?? null,
        p.node_name ?? null,
        p.data_type ?? null,
        JSON.stringify({ source: "agent.transaction_log.json", kind: "x402_payment" }),
        createdAt?.toISOString() ?? new Date().toISOString(),
        new Date().toISOString(),
        status === "CONFIRMED" ? (createdAt?.toISOString() ?? new Date().toISOString()) : null,
      );

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
        p.node_name || "Unknown Node",
        p.amount_usdc != null ? Number(p.amount_usdc) : 0,
        createdAt?.toISOString() ?? new Date().toISOString(),
        p.node_id ?? null,
        status,
        p.recipient_wallet ?? null,
        JSON.stringify({ source: "agent.transaction_log.json", kind: "x402_payment" }),
        new Date().toISOString(),
        new Date().toISOString(),
      );

      imported += 1;
    }

    for (const s of swaps) {
      const txHash = String(s.tx_hash || "").trim().toLowerCase();
      if (!txHash.startsWith("0x")) {
        skipped += 1;
        continue;
      }

      const status = normalizeStatus(s.status);
      const createdAt = parseDate(s.timestamp);

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
        "SWAP",
        status,
        s.token_in ?? null,
        s.token_out ?? null,
        s.amount_in != null ? Number(s.amount_in) : null,
        s.amount_out != null ? Number(s.amount_out) : null,
        null,
        s.price_impact != null ? Number(s.price_impact) : null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify({ source: "agent.transaction_log.json", kind: "swap" }),
        createdAt?.toISOString() ?? new Date().toISOString(),
        new Date().toISOString(),
        status === "CONFIRMED" ? (createdAt?.toISOString() ?? new Date().toISOString()) : null,
      );

      imported += 1;
    }

    return NextResponse.json({
      ok: true,
      txLogPath,
      imported,
      skipped,
      sourceCounts: {
        x402: x402.length,
        swaps: swaps.length,
      },
    });
  } catch (error: any) {
    console.error("Failed to import agent transaction log:", error);
    return NextResponse.json(
      { error: "Failed to import agent transaction log", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const txLogPath = process.env.AGENT_TX_LOG_PATH || path.resolve(process.cwd(), "../agent/transaction_log.json");
  return NextResponse.json({
    endpoint: "/api/transactions/import-agent-log",
    method: "POST",
    readsFrom: txLogPath,
    note: "Imports agent/transaction_log.json into Transaction table using txHash upserts.",
  });
}
