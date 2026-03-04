import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest) {
  try {
    // Delete all LogRatings first (due to foreign key constraint)
    const deletedLogRatings = await prisma.logRating.deleteMany({});

    // Then delete all NodePurchaseTransactions
    const deletedPurchases = await prisma.nodePurchaseTransaction.deleteMany({});

    return NextResponse.json(
      {
        success: true,
        message: "All NodePurchaseTransactions and LogRatings deleted successfully",
        deletedLogRatings: deletedLogRatings.count,
        deletedNodePurchases: deletedPurchases.count,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting NodePurchaseTransactions:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
