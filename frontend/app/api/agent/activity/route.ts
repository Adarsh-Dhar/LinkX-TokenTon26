import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const activity = await prisma.agentActivity.create({
      data: {
        type: body.type,
        title: body.title,
        description: body.description,
        nodeId: body.nodeId,
        nodePrice: body.nodePrice,
        nodeQuality: body.nodeQuality,
        utilityScore: body.utilityScore,
        alphaPerUsdcRatio: body.alphaPerUsdcRatio,
        signalValue: body.signalValue,
        signalSource: body.signalSource,
        tradeBias: body.tradeBias,
        tradeConfidence: body.tradeConfidence,
        tradeReason: body.tradeReason,
        riskAction: body.riskAction,
        riskReason: body.riskReason,
        agentThought: body.agentThought,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      },
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (error) {
    console.error('Failed to record agent activity:', error);
    return NextResponse.json(
      { error: 'Failed to record activity' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Fetch recent agent activities
    const activities = await prisma.agentActivity.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: 50,
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Failed to fetch agent activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}
