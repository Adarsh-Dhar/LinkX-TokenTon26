import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

export async function GET(req: Request) {
  // This endpoint is PUBLIC - Discovery Layer
  // No x402 payment check. Returns full node metadata for free window-shopping.
  try {
    const nodes = await prisma.alphaNode.findMany({
      where: { status: 'active' },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        nodeType: true,
        description: true,
        price: true,
        more_context: true,
        status: true,
        isPurchased: true,
        whitelisted: true,
        historicalWinRate: true,
        lastPurchaseTime: true,
        endpointUrl: true,
        providerAddress: true,
      },
    });
    return NextResponse.json(nodes);
  } catch (error) {
    console.error('Error fetching nodes:', error);
    return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { nodeId } = await req.json();

    const node = await prisma.alphaNode.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        title: true,
        nodeType: true,
        isPurchased: true,
        price: true,
      },
    });

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    if (node.isPurchased) {
      return NextResponse.json({ message: 'Already purchased' });
    }

    // Mark node as purchased in DB (x402 payment handled by agent separately)
    const updatedNode = await prisma.alphaNode.update({
      where: { id: nodeId },
      data: { isPurchased: true },
    });

    return NextResponse.json({
      success: true,
      node: updatedNode,
      message: 'Node marked as purchased.',
    });
  } catch (error: any) {
    console.error('Purchase Failed:', error);
    return NextResponse.json(
      { error: error.message || 'Payment processing failed' },
      { status: 500 }
    );
  }
}