import { NextResponse } from 'next/server';

let dailyLimit = 50;

export async function GET() {
  return NextResponse.json({ dailyLimit });
}

export async function POST(req: Request) {
  const { limit } = await req.json();
  if (typeof limit === 'number' && limit > 0) {
    dailyLimit = limit;
    return NextResponse.json({ status: 'ok', dailyLimit });
  }
  return NextResponse.json({ status: 'error', message: 'Invalid limit' }, { status: 400 });
}
