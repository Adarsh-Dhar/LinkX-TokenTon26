import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const nodeName = searchParams.get("nodeName") || undefined;
    const status = searchParams.get("status")?.toUpperCase() || undefined;

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const limitRaw = Number(searchParams.get("limit") || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    let sql = 'SELECT * FROM "NodePurchaseTransaction" WHERE 1=1';
    const params: any[] = [];

    if (nodeName) {
      sql += ' AND nodeName = ?';
      params.push(nodeName);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (from) {
      const date = new Date(from);
      if (!Number.isNaN(date.getTime())) {
        sql += ' AND timestamp >= ?';
        params.push(date.toISOString());
      }
    }

    if (to) {
      const date = new Date(to);
      if (!Number.isNaN(date.getTime())) {
        sql += ' AND timestamp <= ?';
        params.push(date.toISOString());
      }
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const nodePurchaseTransactions = (await prisma.$queryRawUnsafe(sql, ...params)) as any[];

    return NextResponse.json({
      nodePurchaseTransactions,
      count: nodePurchaseTransactions.length,
    });
  } catch (error: any) {
    console.error("Failed to fetch node purchase transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch node purchase transactions", details: error?.message || String(error) },
      { status: 500 },
    );
  }
}
