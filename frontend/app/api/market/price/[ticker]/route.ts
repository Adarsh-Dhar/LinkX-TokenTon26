import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const buildMockResponse = () => {
    const basePrice = 0.06;
    const timestamp = Date.now();
    const trend = Math.sin(timestamp / 100000) * 0.008;
    const randomWalk = (Math.random() - 0.5) * 0.006;
    const mockPrice = basePrice + trend + randomWalk;

    return NextResponse.json({
      ticker,
      price: parseFloat(mockPrice.toFixed(6)),
      source: 'mock',
      timestamp: timestamp
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  };

  try {
    // Proxy to the server running on port 3050
    const res = await fetch(`http://localhost:3050/market/price/${ticker}`, { 
      cache: 'no-store'
    });
    
    if (!res.ok) {
      console.error(`Server returned status: ${res.status}`);
      return buildMockResponse();
    }
    
    // Check content type
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
  } catch (error: any) {
    const errorCode = error?.cause?.code || error?.code;
    if (errorCode === 'ECONNREFUSED') {
      return buildMockResponse();
    }
    console.error('Failed to fetch market price:', error);
    return buildMockResponse();
  }
}
