import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Optionally support ?range=24h, 7d, etc.
  const nodeId = params.id;
  const purchases = await prisma.nodePurchaseTransaction.findMany({
    where: { nodeId },
    orderBy: { fetchedAt: "desc" },
    take: 50,
    select: {
      fetchedAt: true,
      logRating: {
        select: {
          rating: true
        }
      }
    },
  });

  // Format for chart
  const chartData = purchases.map((purchase: any) => ({
    time: purchase.fetchedAt,
    rating: purchase.logRating?.rating || null,
  }));

  return NextResponse.json(chartData);
}
