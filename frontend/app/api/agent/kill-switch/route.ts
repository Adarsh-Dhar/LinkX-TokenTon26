import { NextResponse } from 'next/server';

let killSwitch = false;

export async function POST(req: Request) {
  const { action } = await req.json();
  if (action === 'kill') {
    killSwitch = true;
    return NextResponse.json({ status: 'killed' });
  }
  if (action === 'resume') {
    killSwitch = false;
    return NextResponse.json({ status: 'resumed' });
  }
  return NextResponse.json({ status: 'unknown' });
}

export async function GET() {
  return NextResponse.json({ killSwitch });
}
