import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * PUT /api/nodes/update
 * Allows providers to update permanent node fields: title, description, more_context
 * Request Body:
 * {
 *   id: string,
 *   title?: string,
 *   description?: string,
 *   more_context?: string
 * }
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, title, description, more_context } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing node id' }, { status: 400 });
    }
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (more_context !== undefined) updateData.more_context = more_context;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }
    updateData.lastUpdated = new Date();
    const updatedNode = await prisma.alphaNode.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ success: true, node: updatedNode });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
