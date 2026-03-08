import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed with schema-aligned Alpha Nodes...");

  // Clear existing data to avoid constraint errors (order matters due to foreign keys)
  await prisma.tradeDecision.deleteMany();
  await prisma.logRating.deleteMany(); // Delete before NodePurchaseTransaction (has FK reference)
  await prisma.nodePurchaseTransaction.deleteMany();
  await prisma.agentActivity.deleteMany();
  await prisma.alphaNode.deleteMany();

  const nodes = [
    {
      title: "Market Microstructure & Execution",
      nodeType: "microstructure",
      category: "Technical",
      description: "Provides deep-level insights into immediate liquidity and trading dynamics.",
      price: 0.25,
      status: "active",
      isPurchased: false,
      whitelisted: true,
      endpointUrl: "http://localhost:4001/api/microstructure",
      icon: "activity",
      ratings: 0,
      latencyMs: 5,
      historicalWinRate: 0.0,
    },
    {
      title: "Alternative Intelligence & Sentiment",
      nodeType: "sentiment",
      category: "Sentiment",
      description: "Quantifies the 'human element' by aggregating social platform data.",
      price: 0.45,
      status: "active",
      isPurchased: false,
      whitelisted: true,
      endpointUrl: "http://localhost:4002/api/sentiment",
      icon: "zap",
      ratings: 0,
      latencyMs: 75,
      historicalWinRate: 0.0,
    },
    {
      title: "Supply Chain & Global Macro",
      nodeType: "macro",
      category: "Macro",
      description: "Monitors large-scale economic and physical world data impact.",
      price: 0.65,
      status: "active",
      isPurchased: false,
      whitelisted: true,
      endpointUrl: "http://localhost:4003/api/macro",
      icon: "globe",
      ratings: 0,
      latencyMs: 150,
      historicalWinRate: 0.0,
    },
  ];

  for (const nodeData of nodes) {
    const node = await prisma.alphaNode.create({
      data: nodeData,
    });
    console.log(`✅ Created node: ${node.title}`);
  }

  console.log("\n📊 Seeding finished successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });