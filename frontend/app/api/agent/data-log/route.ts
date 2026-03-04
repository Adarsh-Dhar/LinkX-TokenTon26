import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  // Get the 50 most recent NodePurchaseTransaction entries
  const purchases = await prisma.nodePurchaseTransaction.findMany({
    orderBy: { fetchedAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({
    dataLog: purchases.map(p => ({
      fetchedAt: p.fetchedAt,
      data: p.data,
      pricePaid: p.pricePaid
    }))
  });
}
