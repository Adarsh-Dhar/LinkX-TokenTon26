import { NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { percentageChange, previousValue, currentValue, timestamp, timeWindow } = body;

    if (percentageChange === undefined || previousValue === undefined || !currentValue || !timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Save as AgentActivity
    const activity = await prisma.agentActivity.create({
      data: {
        type: 'portfolio_change',
        title: percentageChange > 0 ? `Portfolio Increased (${timeWindow || 'unknown'})` : `Portfolio Decreased (${timeWindow || 'unknown'})`,
        description: `Portfolio value ${percentageChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentageChange).toFixed(2)}% over ${timeWindow} (from $${previousValue.toFixed(2)} to $${currentValue.toFixed(2)})`,
        utilityScore: Math.abs(percentageChange) / 100,
        signalValue: percentageChange,
        signalSource: `portfolio_monitor_${timeWindow}`,
        tradeBias: percentageChange > 0 ? 'BUY' : 'SELL',
        tradeReason: `Automatic portfolio change detection over ${timeWindow}: ${Math.abs(percentageChange).toFixed(2)}% ${percentageChange > 0 ? 'gain' : 'loss'}`,
      },
    });

    return NextResponse.json(
      { success: true, activity },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error saving portfolio change:', error);
    return NextResponse.json(
      { error: 'Failed to save portfolio change event' },
      { status: 500 }
    );
  }
}
