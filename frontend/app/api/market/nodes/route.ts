
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { nodeId, whitelisted } = body;
    if (!nodeId || typeof whitelisted !== "boolean") {
      return NextResponse.json({ error: "Missing nodeId or whitelisted flag" }, { status: 400 });
    }
    const node = await prisma.alphaNode.findUnique({ where: { id: nodeId } });
    if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
    const updated = await prisma.alphaNode.update({
      where: { id: nodeId },
      data: { whitelisted },
    });
    return NextResponse.json({ success: true, node: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update whitelist status" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const nodes = await prisma.alphaNode.findMany({
      where: { status: 'active' }
    });
    return NextResponse.json(nodes);
  } catch (error) {
    return NextResponse.json({ error: 'Database failure' }, { status: 500 });
  }
} 
