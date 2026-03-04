import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  // Support /api/market/price/[pair] by extracting pair from URL
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const pair = pathParts[pathParts.length - 1];

  // If the route is /api/market/price/SOL-USDC, return latest price
  if (pair && pair.match(/^[A-Z]+-[A-Z]+$/)) {
    // Fetch chart data (portfolio snapshots)
    const snapshots = await prisma.portfolioSnapshot.findMany({
      orderBy: { timestamp: 'desc' },
      take: 1,
    });
    if (snapshots.length > 0) {
      // For SOL-USDC, calculate price as wrappedSolBalance/usdcBalance (or vice versa)
      const snap = snapshots[0];
      let price = null;
      if (pair === 'SOL-USDC' && snap.usdcBalance > 0) {
        price = snap.wrappedSolBalance / snap.usdcBalance;
      } else if (pair === 'USDC-SOL' && snap.wrappedSolBalance > 0) {
        price = snap.usdcBalance / snap.wrappedSolBalance;
      }
      if (price !== null && isFinite(price)) {
        return NextResponse.json({ pair, price: parseFloat(price.toFixed(6)), timestamp: snap.timestamp.toISOString() });
      }
    }
    // If no data or invalid, return 404
    return NextResponse.json({ error: 'Price not found' }, { status: 404 });
  }

  try {
    // Fetch real portfolio snapshots from database
    // Get last 60 snapshots ordered by timestamp
    const snapshots = await prisma.portfolioSnapshot.findMany({
      orderBy: { timestamp: 'asc' },
      take: 60,
    });

    // If we have real snapshots, use them
    if (snapshots.length > 0) {
      const chartData = snapshots.map((snap) => {
        const timestamp = new Date(snap.timestamp);
        const hour = String(timestamp.getHours()).padStart(2, '0');
        const minute = String(timestamp.getMinutes()).padStart(2, '0');
        const second = String(timestamp.getSeconds()).padStart(2, '0');
        const timeStr = `${hour}:${minute}:${second}`;

        return {
          time: timeStr,
          value: parseFloat(snap.totalValueUsd.toFixed(2)), // Use the calculated totalValueUsd from DB
          wrappedSolBalance: parseFloat(snap.wrappedSolBalance.toFixed(4)),
          usdcBalance: parseFloat(snap.usdcBalance.toFixed(2)),
          timestamp: snap.timestamp.toISOString(),
        };
      });

      return NextResponse.json(chartData);
    }

    // If no snapshots yet, return mock data with 60 historical points
    const mockData = Array.from({ length: 60 }, (_, i) => {
      const minutesAgo = 59 - i;
      const timestamp = new Date(Date.now() - minutesAgo * 60000);
      const hour = String(timestamp.getHours()).padStart(2, '0');
      const minute = String(timestamp.getMinutes()).padStart(2, '0');
      const second = String(timestamp.getSeconds()).padStart(2, '0');
      const timeStr = `${hour}:${minute}:${second}`;

      // Create realistic portfolio value movement
      const baseValue = 1000; // Starting portfolio value
      const volatility = Math.sin(i * 0.1) * 30 + (Math.random() * 20 - 10);
      const value = baseValue + volatility;

      return {
        time: timeStr,
        value: parseFloat(value.toFixed(2)),
        wrappedSolBalance: parseFloat((Math.random() * 500).toFixed(4)),
        usdcBalance: parseFloat((Math.random() * 500).toFixed(2)),
        timestamp: timestamp.toISOString(),
      };
    });

    return NextResponse.json(mockData);
  } catch (error) {
    console.error('Chart API Error:', error);
    
    // Fallback mock data
    const mockData = Array.from({ length: 60 }, (_, i) => {
      const minutesAgo = 59 - i;
      const timestamp = new Date(Date.now() - minutesAgo * 60000);
      const hour = String(timestamp.getHours()).padStart(2, '0');
      const minute = String(timestamp.getMinutes()).padStart(2, '0');
      const second = String(timestamp.getSeconds()).padStart(2, '0');
      const timeStr = `${hour}:${minute}:${second}`;
      
      const baseValue = 1000;
      const volatility = Math.sin(i * 0.1) * 30 + (Math.random() * 20 - 10);
      const value = baseValue + volatility;
      
      return {
        time: timeStr,
        value: parseFloat(value.toFixed(2)),
        wrappedSolBalance: parseFloat((Math.random() * 500).toFixed(4)),
        usdcBalance: parseFloat((Math.random() * 500).toFixed(2)),
        timestamp: timestamp.toISOString(),
      };
    });

    return NextResponse.json(mockData);
  }
}