import { NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  // Get the 50 most recent TradeDecision entries, joined with trade and transaction
  const logs = await prisma.tradeDecision.findMany({
    orderBy: { decidedAt: 'desc' },
    take: 50,
    include: {
      trade: true
    }
  });
  const decisionLog = logs
    .map((l) => {
      let parsed: any = null;
      try {
        parsed = l.context ? JSON.parse(l.context) : null;
      } catch {
        parsed = null;
      }

      const action = typeof parsed?.action === 'string' ? parsed.action.trim() : '';
      const amount = typeof parsed?.amount === 'string' ? parsed.amount.trim() : '';
      const isSwapAction = action.includes('->');
      const hasPercent = amount.includes('%');

      if (!isSwapAction || !amount || hasPercent) {
        return null;
      }

      return {
        decidedAt: l.decidedAt,
        action,
        amount,
        context: l.context || ''
      };
    })
    .filter(Boolean);

  // If no parsed trade decisions are available, fallback to transaction ledger
  if (decisionLog.length === 0) {
    const txRows = await prisma.$queryRawUnsafe('SELECT * FROM "Transaction" ORDER BY createdAt DESC LIMIT 50') as Array<Record<string, any>>;

    const txDecisionLog = txRows.map((tx: any) => {
      const tokenIn = tx.tokenIn || '';
      const tokenOut = tx.tokenOut || '';
      const amountIn = typeof tx.amountIn === 'number' ? tx.amountIn : null;

      let action = tx.txType || 'TRANSACTION';
      let amount = amountIn != null ? `${amountIn} ${tokenIn || ''}`.trim() : 'N/A';

      if (tx.txType === 'SWAP') {
        action = `${tokenIn || 'TOKEN'} -> ${tokenOut || 'TOKEN'}`;
      } else if (tx.txType === 'X402_PAYMENT') {
        action = 'X402_PAYMENT';
        amount = amountIn != null ? `${amountIn} USDC` : 'N/A';
      }

      return {
        id: tx.id,
        decidedAt: tx.createdAt,
        action,
        amount,
        context: tx.metadata || '',
      };
    });

    if (txDecisionLog.length > 0) {
      return NextResponse.json({ decisionLog: txDecisionLog });
    }

    // Final fallback: read raw agent transaction log file directly
    try {
      const txLogPath = process.env.AGENT_TX_LOG_PATH || path.resolve(process.cwd(), '../agent/transaction_log.json');
      const raw = await fs.readFile(txLogPath, 'utf8');
      const parsed = JSON.parse(raw || '{}');

      const x402 = Array.isArray(parsed?.x402_payments) ? parsed.x402_payments : [];
      const swaps = Array.isArray(parsed?.swaps) ? parsed.swaps : [];

      const rawDecisionLog = [
        ...x402
          .filter((r: any) => typeof r?.tx_hash === 'string')
          .map((r: any) => ({
            id: r.tx_hash,
            decidedAt: r.timestamp || new Date().toISOString(),
            action: 'X402_PAYMENT',
            amount: typeof r.amount_usdc === 'number' ? `${r.amount_usdc} USDC` : 'N/A',
            context: '',
          })),
        ...swaps
          .filter((r: any) => typeof r?.tx_hash === 'string')
          .map((r: any) => ({
            id: r.tx_hash,
            decidedAt: r.timestamp || new Date().toISOString(),
            action: `${r.token_in || 'TOKEN'} -> ${r.token_out || 'TOKEN'}`,
            amount: typeof r.amount_in === 'number' ? `${r.amount_in} ${r.token_in || ''}`.trim() : 'N/A',
            context: '',
          })),
      ]
        .sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime())
        .slice(0, 50);

      return NextResponse.json({ decisionLog: rawDecisionLog });
    } catch {
      return NextResponse.json({ decisionLog: [] });
    }
  }

  return NextResponse.json({ decisionLog });
}

export async function POST(request: Request) {
  // Accepts: tradeId, txId, context
  const body = await request.json();
  const { tradeId, txId, context } = body;
  if (!tradeId || !txId) {
    return NextResponse.json({ error: 'tradeId and txId required' }, { status: 400 });
  }
  const decision = await prisma.tradeDecision.create({
    data: {
      tradeId,
      txId,
      context: context || null
    }
  });
  return NextResponse.json({ success: true, decision });
}
