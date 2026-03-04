import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  // Sum all data costs and trade profits
  const purchases = await prisma.nodePurchaseTransaction.findMany();
  const tradeDecisions = await prisma.tradeDecision.findMany({ include: { trade: true } });

  const cost = purchases.reduce((sum, p) => sum + (typeof p.pricePaid === 'number' ? p.pricePaid : 0), 0);
  const profit = tradeDecisions.reduce((sum, d) => sum + (d.trade?.realizedPnL || 0), 0);

  return NextResponse.json({
    roi: { cost, profit }
  });
}
