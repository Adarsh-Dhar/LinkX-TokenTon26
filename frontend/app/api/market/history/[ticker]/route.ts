import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const buildMockResponse = () => {
    let lastPrice = 0.06; // Starting price
    const mockHistory = Array.from({ length: 30 }, (_, i) => {
      const minutesAgo = 29 - i;
      const timestamp = new Date(Date.now() - minutesAgo * 60000);
      const hour = String(timestamp.getHours()).padStart(2, '0');
      const minute = String(timestamp.getMinutes()).padStart(2, '0');
      const second = String(timestamp.getSeconds()).padStart(2, '0');
      const timeStr = `${hour}:${minute}:${second}`;

      const changePercent = (Math.random() - 0.5) * 0.05; // ±2.5% change
      lastPrice = lastPrice * (1 + changePercent);
      lastPrice = Math.max(0.045, Math.min(0.075, lastPrice));

      return {
        time: timeStr,
        price: parseFloat(lastPrice.toFixed(6)),
        timestamp: timestamp.getTime()
      };
    });

    return NextResponse.json({
      ticker,
      history: mockHistory,
      source: 'mock'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  };

  try {
    // Try to fetch historical data from the server on port 3050
    const res = await fetch(`http://localhost:3050/market/history/${ticker}`, { 
      cache: 'no-store'
    });
    
    if (!res.ok) {
      console.error(`Server error: ${res.status}`);
      return buildMockResponse();
    }
    
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      console.error('Response is not JSON, content-type:', contentType);
      return buildMockResponse();
    }

    try {
      const data = await res.json();
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    } catch (jsonError) {
      console.error('Failed to parse JSON from upstream:', jsonError);
      return buildMockResponse();
    }
  } catch (error) {
    console.error('Failed to fetch historical data, using mock data:', error);
    return buildMockResponse();
  }
}
