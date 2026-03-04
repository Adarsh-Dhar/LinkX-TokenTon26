import { NextResponse } from 'next/server';

export async function GET() {
  // Simple test endpoint for monitoring
  return NextResponse.json({ status: 'ok', message: 'Agent backend is running.' });
}
