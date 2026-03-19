import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db'; // Import the singleton instance we fixed earlier

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const pair = pathParts[pathParts.length - 1];

  // 1. Handle Price Requests (e.g., /api/market/price/SOL-USDC)
  if (pair && pair.match(/^[A-Z]+-[A-Z]+$/)) {
    try {
      const snapshots = await prisma.portfolioSnapshot.findMany({
        orderBy: { timestamp: 'desc' },
        take: 1,
      });

      if (snapshots.length > 0) {
        const snap = snapshots[0];
        let price = null;
        
        // Logic to derive price from current balances
        if (pair === 'SOL-USDC' && snap.usdcBalance > 0) {
          price = snap.wrappedSolBalance / snap.usdcBalance;
        } else if (pair === 'USDC-SOL' && snap.wrappedSolBalance > 0) {
          price = snap.usdcBalance / snap.wrappedSolBalance;
        }

        if (price !== null && isFinite(price)) {
          return NextResponse.json({ 
            pair, 
            price: parseFloat(price.toFixed(6)), 
            timestamp: snap.timestamp.toISOString() 
          });
        }
      }
      return NextResponse.json({ error: 'Price not found' }, { status: 404 });
    } catch (dbError) {
      console.error('Database Error in Price API:', dbError);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  }

  // 2. Handle Chart Data Requests
  try {
    const snapshots = await prisma.portfolioSnapshot.findMany({
      orderBy: { timestamp: 'asc' },
      take: 60,
    });

    if (snapshots.length > 0) {
      const chartData = snapshots.map((snap) => {
        const timestamp = new Date(snap.timestamp);
        const timeStr = timestamp.toLocaleTimeString('en-GB', { hour12: false });

        return {
          time: timeStr,
          value: parseFloat(snap.totalValueUsd.toFixed(2)),
          wrappedSolBalance: parseFloat(snap.wrappedSolBalance.toFixed(4)),
          usdcBalance: parseFloat(snap.usdcBalance.toFixed(2)),
          timestamp: snap.timestamp.toISOString(),
        };
      });

      return NextResponse.json(chartData);
    }

    // 3. Fallback to Mock Data if DB is empty
    return NextResponse.json(generateMockData(60));

  } catch (error) {
    console.error('Chart API Error:', error);
    // Return mock data so the frontend doesn't crash during DB issues
    return NextResponse.json(generateMockData(60));
  }
}

// Helper to keep the route clean
function generateMockData(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(Date.now() - (count - 1 - i) * 60000);
    return {
      time: timestamp.toLocaleTimeString('en-GB', { hour12: false }),
      value: parseFloat((1000 + Math.sin(i * 0.1) * 30 + (Math.random() * 20 - 10)).toFixed(2)),
      wrappedSolBalance: parseFloat((Math.random() * 500).toFixed(4)),
      usdcBalance: parseFloat((Math.random() * 500).toFixed(2)),
      timestamp: timestamp.toISOString(),
    };
  });
}