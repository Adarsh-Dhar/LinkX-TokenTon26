import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // 1. Fetch recent trades
    const recentTrades = await prisma.trade.findMany({
      where: {
        timestamp: {
          gte: thirtyMinutesAgo,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 10,
    });

    // 2. Fetch recently whitelisted/blacklisted nodes from agent activities
    const recentWhitelistEvents = await prisma.agentActivity.findMany({
      where: {
        timestamp: {
          gte: thirtyMinutesAgo,
        },
        type: {
          in: ['whitelist_node', 'blacklist_node'],
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 10,
    });

    // 3. Fetch agent activities (node purchases, utility scores, decisions, etc.)
    const agentActivities = await prisma.agentActivity.findMany({
      where: {
        timestamp: {
          gte: thirtyMinutesAgo,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: 15,
    });

    // 4. Fetch portfolio snapshots to detect price surges/dips
    const portfolioSnapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        timestamp: {
          gte: thirtyMinutesAgo,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
      take: 100,
    });

    // Detect major surges/dips (>5% change)
    const priceMovements: any[] = [];
    if (portfolioSnapshots.length >= 2) {
      for (let i = 1; i < portfolioSnapshots.length; i++) {
        const prev = portfolioSnapshots[i - 1];
        const curr = portfolioSnapshots[i];
        const changePercent =
          ((curr.totalValueUsd - prev.totalValueUsd) / prev.totalValueUsd) * 100;

        if (Math.abs(changePercent) > 5) {
          priceMovements.push({
            type: 'price_movement',
            direction: changePercent > 0 ? 'surge' : 'dip',
            changePercent: Math.round(changePercent * 100) / 100,
            value: curr.totalValueUsd,
            timestamp: curr.timestamp,
          });
        }
      }
    }

    // 5. Aggregate and sort all activities by timestamp (descending)
    const activities = [
      ...recentTrades.map((trade) => ({
        id: trade.id,
        type: 'trade',
        title: `Swapped ${trade.tokenIn}/${trade.tokenOut}`,
        description: `${trade.amountIn} ${trade.tokenIn} → ${trade.amountOut} ${trade.tokenOut}`,
        value: trade.realizedPnL ?? 0,
        isPositive: (trade.realizedPnL ?? 0) >= 0,
        timestamp: trade.timestamp,
        icon: 'trade',
      })),
      ...recentWhitelistEvents.map((activity) => {
        let metadata: Record<string, any> | null = null;
        if (activity.metadata) {
          try {
            metadata = JSON.parse(activity.metadata);
          } catch {
            metadata = null;
          }
        }

        const nodeName = metadata?.nodeName ?? activity.title ?? 'Node';
        const isWhitelist = activity.type === 'whitelist_node';

        return {
          id: activity.id,
          type: activity.type,
          title: isWhitelist ? `Whitelisted ${nodeName}` : `Blacklisted ${nodeName}`,
          description: isWhitelist 
            ? `${nodeName} is now available for agent trading` 
            : `${nodeName} excluded from agent trading`,
          value: 0,
          isPositive: isWhitelist,
          timestamp: activity.timestamp,
          icon: 'node',
        };
      }),
      ...agentActivities.map((activity) => {
        let metadata: Record<string, any> | null = null;
        if (activity.metadata) {
          try {
            metadata = JSON.parse(activity.metadata);
          } catch {
            metadata = null;
          }
        }

        const tradeAmount = metadata?.tradeAmount ?? null;
        const tokenIn = metadata?.tokenIn ?? null;
        const tokenOut = metadata?.tokenOut ?? null;

        const description = activity.description
          || (tradeAmount && tokenIn
            ? `Amount: ${tradeAmount} ${tokenIn}${tokenOut ? ` → ${tokenOut}` : ''}`
            : activity.agentThought || `${activity.type}: ${activity.title}`);

        const value =
          activity.nodePrice
          ?? tradeAmount
          ?? activity.utilityScore
          ?? activity.tradeConfidence
          ?? 0;

        return {
          id: activity.id,
          type: activity.type,
          title: activity.title,
          description,
          value,
          isPositive:
            activity.type === 'node_purchase' ||
            (activity.type === 'utility_score' && (activity.utilityScore ?? 0) > 0.5) ||
            (activity.type === 'trade_decision' && (activity.tradeBias === 'BUY' || activity.tradeBias === 'LONG')),
          timestamp: activity.timestamp,
          icon: getAgentActivityIcon(activity.type),
        };
      }),
      ...priceMovements.map((movement, index) => ({
        id: `price_${index}`,
        type: 'price_movement',
        title: movement.direction === 'surge' ? '📈 Portfolio Surge' : '📉 Portfolio Dip',
        description: `${movement.direction === 'surge' ? '+' : ''}${movement.changePercent}% change`,
        value: movement.changePercent,
        isPositive: movement.direction === 'surge',
        timestamp: movement.timestamp,
        icon: movement.direction === 'surge' ? 'trend-up' : 'trend-down',
      })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return NextResponse.json({
      activities: activities.slice(0, 12),
      total: activities.length,
      source: 'database',
    });
  } catch (error) {
    console.error('Failed to fetch recent activity:', error);

    // Return mock activity if database fails
    return NextResponse.json({
      activities: [
        {
          id: '1',
          type: 'node_purchase',
          title: 'Purchased Market Microstructure & Execution',
          description: 'Quality: 98% | Price: 0.25 USDC | Utility: 0.74',
          value: 0.25,
          isPositive: true,
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          icon: 'node',
        },
        {
          id: '2',
          type: 'utility_score',
          title: 'Utility Score Computed',
          description: 'Utility: 0.7404 | Alpha/USDC: 2.9616',
          value: 0.74,
          isPositive: true,
          timestamp: new Date(Date.now() - 10 * 60 * 1000),
          icon: 'score',
        },
      ],
      total: 2,
      source: 'mock',
    });
  }
}

function getAgentActivityIcon(type: string): string {
  switch (type) {
    case 'node_purchase':
      return 'node';
    case 'utility_score':
      return 'score';
    case 'trade_decision':
      return 'trade';
    case 'signal_received':
      return 'signal';
    case 'risk_skip':
      return 'shield';
    case 'cycle_start':
      return 'play';
    case 'cycle_end':
      return 'stop';
    default:
      return 'activity';
  }
}
