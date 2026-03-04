import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const txType = searchParams.get("txType")?.toUpperCase() || undefined;
    const status = searchParams.get("status")?.toUpperCase() || undefined;
    const tokenIn = searchParams.get("tokenIn") || undefined;
    const tokenOut = searchParams.get("tokenOut") || undefined;
    const nodeId = searchParams.get("nodeId") || undefined;

    const limitRaw = Number(searchParams.get("limit") || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let sql = 'SELECT * FROM "Transaction" WHERE 1=1';
    const params: any[] = [];

    if (txType) {
      sql += ' AND txType = ?';
      params.push(txType);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (tokenIn) {
      sql += ' AND tokenIn = ?';
      params.push(tokenIn);
    }
    if (tokenOut) {
      sql += ' AND tokenOut = ?';
      params.push(tokenOut);
    }
    if (nodeId) {
      sql += ' AND nodeId = ?';
      params.push(nodeId);
    }

    if (from) {
      const date = new Date(from);
      if (!Number.isNaN(date.getTime())) {
        sql += ' AND createdAt >= ?';
        params.push(date.toISOString());
      }
    }
    if (to) {
      const date = new Date(to);
      if (!Number.isNaN(date.getTime())) {
        sql += ' AND createdAt <= ?';
        params.push(date.toISOString());
      }
    }

    sql += ' ORDER BY createdAt DESC LIMIT ?';
    params.push(limit);

    let transactions = (await prisma.$queryRawUnsafe(sql, ...params)) as any[];

    if (transactions.length === 0) {
      try {
        const txLogPath = process.env.AGENT_TX_LOG_PATH || path.resolve(process.cwd(), "../agent/transaction_log.json");
        const raw = await fs.readFile(txLogPath, "utf8");
        const parsed = JSON.parse(raw || "{}");
        const x402 = Array.isArray(parsed?.x402_payments) ? parsed.x402_payments : [];
        const swaps = Array.isArray(parsed?.swaps) ? parsed.swaps : [];

        transactions = [
          ...x402
            .filter((r: any) => typeof r?.tx_hash === "string")
            .map((r: any) => ({
              id: r.tx_hash,
              txHash: String(r.tx_hash).toLowerCase(),
              txType: "X402_PAYMENT",
              status: String(r.status || "CONFIRMED").toUpperCase(),
              tokenIn: "USDC",
              tokenOut: null,
              amountIn: typeof r.amount_usdc === "number" ? r.amount_usdc : null,
              amountOut: null,
              nodeId: r.node_id || null,
              nodeName: r.node_name || null,
              dataType: r.data_type || null,
              createdAt: r.timestamp || new Date().toISOString(),
            })),
          ...swaps
            .filter((r: any) => typeof r?.tx_hash === "string")
            .map((r: any) => ({
              id: r.tx_hash,
              txHash: String(r.tx_hash).toLowerCase(),
              txType: "SWAP",
              status: String(r.status || "CONFIRMED").toUpperCase(),
              tokenIn: r.token_in || null,
              tokenOut: r.token_out || null,
              amountIn: typeof r.amount_in === "number" ? r.amount_in : null,
              amountOut: typeof r.amount_out === "number" ? r.amount_out : null,
              nodeId: null,
              nodeName: null,
              dataType: null,
              createdAt: r.timestamp || new Date().toISOString(),
            })),
        ]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, limit);
      } catch {
        transactions = [];
      }
    }

    return NextResponse.json({
      transactions,
      count: transactions.length,
    });
  } catch (error: any) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}
