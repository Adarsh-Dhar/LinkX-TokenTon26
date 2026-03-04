import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  // Get node purchases from NodePurchaseTransaction table
  const nodePurchases = await prisma.$queryRawUnsafe(
    'SELECT * FROM "NodePurchaseTransaction" ORDER BY timestamp DESC LIMIT 50'
  );

  if (nodePurchases && (nodePurchases as any[]).length > 0) {
    const purchaseLog = (nodePurchases as any[]).map((purchase) => ({
      txHash: purchase.txHash,
      timestamp: purchase.timestamp,
      nodeName: purchase.nodeName,
      pricePaid: purchase.pricePaid,
      status: purchase.status,
    }));
    return NextResponse.json({ purchaseLog });
  }

  // Fallback: read raw agent transaction log file directly
  try {
    const txLogPath = process.env.AGENT_TX_LOG_PATH || path.resolve(process.cwd(), '../agent/transaction_log.json');
    const raw = await fs.readFile(txLogPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');

    const x402 = Array.isArray(parsed?.x402_payments) ? parsed.x402_payments : [];

    const purchaseLog = x402
      .filter((r: any) => typeof r?.tx_hash === 'string')
      .map((r: any) => ({
        txHash: r.tx_hash,
        timestamp: r.timestamp || new Date().toISOString(),
        nodeName: r.node_name || 'Unknown',
        pricePaid: typeof r.amount_usdc === 'number' ? r.amount_usdc : 0,
        status: r.status || 'CONFIRMED',
      }))
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);

    return NextResponse.json({ purchaseLog });
  } catch {
    return NextResponse.json({ purchaseLog: [] });
  }
}

export async function POST(request: Request) {
  // Accepts: txHash, nodeName, pricePaid, timestamp, status
  const body = await request.json();
  const { txHash, nodeName, pricePaid, timestamp, status } = body;
  
  if (!txHash || !nodeName || pricePaid === undefined) {
    return NextResponse.json(
      { error: 'txHash, nodeName, and pricePaid required' },
      { status: 400 }
    );
  }

  try {
    const purchase = await prisma.$executeRawUnsafe(
      `INSERT INTO "NodePurchaseTransaction" (id, txHash, nodeName, pricePaid, timestamp, status, createdAt, updatedAt)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(txHash) DO UPDATE SET
         nodeName=?, pricePaid=?, timestamp=?, status=?, updatedAt=datetime('now')`,
      txHash,
      nodeName,
      pricePaid,
      timestamp || new Date().toISOString(),
      status || 'CONFIRMED',
      nodeName,
      pricePaid,
      timestamp || new Date().toISOString(),
      status || 'CONFIRMED'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating node purchase:', error);
    return NextResponse.json({ error: 'Failed to create node purchase' }, { status: 500 });
  }
}
