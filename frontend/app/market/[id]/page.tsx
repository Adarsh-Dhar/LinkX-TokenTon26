
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

import LogRatingClient from "./LogRatingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NodeDetailsPage({ params }: { params: Promise<{ id?: string }> }) {
  const resolvedParams = await params;
  if (!resolvedParams?.id || typeof resolvedParams.id !== "string" || resolvedParams.id.trim() === "") {
    notFound();
  }

  const node = await prisma.alphaNode.findUnique({
    where: { id: resolvedParams.id },
  });

  if (!node) notFound();

  const purchaseDelegate = (prisma as any).nodePurchaseTransaction;
  const nodePurchases = purchaseDelegate?.findMany
    ? await purchaseDelegate.findMany({
        where: { nodeId: node.id },
        orderBy: { timestamp: "desc" },
        take: 50,
      })
    : await prisma.$queryRawUnsafe<Array<{ id: string; data: string | null; timestamp: string | Date; fetchedAt: string | Date | null }>>(
        `SELECT "id", "data", "timestamp", "fetchedAt"
         FROM "NodePurchaseTransaction"
         WHERE "nodeId" = '${node.id.replace(/'/g, "''")}'
         ORDER BY "timestamp" DESC
         LIMIT 50`
      );

  let ratingsByTxId = new Map<string, { rating?: number; comment?: string }>();
  try {
    const joined = await prisma.$queryRawUnsafe<Array<{ txId: string; rating: number | null; comment: string | null }>>(
      `SELECT "txId", "rating", "comment" FROM "LogRating" WHERE "txId" IS NOT NULL`
    );
    ratingsByTxId = new Map(
      joined.map((r) => [r.txId, { rating: typeof r.rating === "number" ? r.rating : undefined, comment: r.comment ?? undefined }])
    );
  } catch {
    const fallback = await prisma.$queryRawUnsafe<Array<{ logId: string; rating: number | null; comment: string | null }>>(
      `SELECT "logId", "rating", "comment" FROM "LogRating" WHERE "logId" IS NOT NULL`
    );
    ratingsByTxId = new Map(
      fallback.map((r) => [r.logId, { rating: typeof r.rating === "number" ? r.rating : undefined, comment: r.comment ?? undefined }])
    );
  }

  // Prepare ratings history for chart from vote history (timestamp + average after each vote)
  const ratingHistoryRows = await prisma.$queryRawUnsafe<Array<{ timestamp: string | Date; averageRating: number }>>(
    `SELECT "timestamp", "averageRating"
     FROM "RatingHistory"
     WHERE "nodeId" = '${node.id.replace(/'/g, "''")}'
     ORDER BY "timestamp" ASC
     LIMIT 200`
  );

  const ratings = ratingHistoryRows.map((row) => ({
    time: new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    rating: Number(row.averageRating),
  }));

  // Format fetchedAt for each purchase on the server
  const purchasesWithFormattedDate = nodePurchases.map((tx: any) => ({
    ...tx,
    logRating: ratingsByTxId.get(tx.id) ?? null,
    fetchedAtFormatted: new Date(tx.fetchedAt ?? tx.timestamp).toISOString(), // Use ISO for consistency
  }));
  return <LogRatingClient node={{ ...node, nodePurchases: purchasesWithFormattedDate }} ratings={ratings} />;
}
