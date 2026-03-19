
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { createThirdwebClient } from 'thirdweb';
import { facilitator as thirdwebFacilitator, settlePayment } from 'thirdweb/x402';
// import { solanaDevnet } from 'thirdweb/chains';


const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

const thirdwebX402Facilitator = thirdwebFacilitator({
  client,
  serverWalletAddress: process.env.WALLET_PRIVATE_KEY!,
  waitUntil: 'confirmed',
});


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
        category: true,
        description: true,
        price: true,
        ratings: true,
        latencyMs: true,
        more_context: true,
        icon: true,
        status: true,
        isPurchased: true,
        whitelisted: true,
        historicalWinRate: true,
        lastPurchaseTime: true,
        // ...existing code...
        endpointUrl: true,
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
    const { nodeId, typedData, signature } = await req.json();

    // 1. Find the Node (The Product)
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

    // 2. Setup payment details
    // const providerAddress = node.provider || '29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL';
    const priceAmount = node.price?.toString() || '10000';

    // 3. Verify x402 payment using thirdweb
    const paymentResult = await settlePayment({
      facilitator: thirdwebX402Facilitator,
      resourceUrl: `http://localhost:4001/api/${node.id}`,
      method: 'GET',
      paymentData: JSON.stringify({ typedData, signature }),
      network: 'solanaDevnet',
      price: priceAmount,
    });

    if (paymentResult.status !== 200) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 402 });
    }

    // 4. Unlock the Node in DB
    const updatedNode = await prisma.alphaNode.update({
      where: { id: nodeId },
      data: {
        isPurchased: true,
      },
    });

    return NextResponse.json({
      success: true,
      node: updatedNode,
      message: 'Node marked as purchased.',
    });
  } catch (error: any) {
    console.error('Payment Failed:', error);
    return NextResponse.json(
      { error: error.message || 'Payment processing failed' },
      { status: 500 }
    );
  }
}