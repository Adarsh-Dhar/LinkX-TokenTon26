import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });
const PROVIDER_WALLETS = {
  microstructure: process.env.NODE_WALLET_MICROSTRUCTURE || "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
  sentiment:      process.env.NODE_WALLET_SENTIMENT      || "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  macro:          process.env.NODE_WALLET_MACRO          || "7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMvoiM",
};

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
      description:
        "Provides deep-level insights into immediate liquidity, order-book dynamics, " +
        "and optimal execution paths. Detects whale dumps, frontrunning, and MEV patterns.",
      more_context:
        "Endpoint implements x402: returns HTTP 402 with X-Payment-Wallet header. " +
        "Agent pays providerAddress and receives signal via proof header.",
      price: 0.25,
      status: "active",
      isPurchased: false,
      whitelisted: true,
      endpointUrl: "http://localhost:4001/api/microstructure",
      providerAddress: PROVIDER_WALLETS.microstructure,
      historicalWinRate: 0.0,
      reliabilityScore: 1.0,
    },
    {
      title: "Alternative Intelligence & Sentiment",
      nodeType: "sentiment",
      description:
        "Quantifies the 'human element' of the market by aggregating social platform data, " +
        "news outlets, and on-chain whale wallet activity into a single sentiment signal.",
      more_context:
        "Endpoint implements x402: returns HTTP 402 with X-Payment-Wallet header. " +
        "Agent pays providerAddress and receives signal via proof header.",
      price: 0.45,
      status: "active",
      isPurchased: false,
      whitelisted: true,
      endpointUrl: "http://localhost:4002/api/sentiment",
      providerAddress: PROVIDER_WALLETS.sentiment,
      historicalWinRate: 0.0,
      reliabilityScore: 1.0,
    },
    {
      title: "Supply Chain & Global Macro",
      nodeType: "macro",
      description:
        "Monitors large-scale economic and physical-world data that impacts long-term " +
        "asset valuations: freight indices, energy prices, central-bank flows, and more.",
      more_context:
        "Endpoint implements x402: returns HTTP 402 with X-Payment-Wallet header. " +
        "Agent pays providerAddress and receives signal via proof header.",
      price: 0.65,
      status: "active",
      isPurchased: false,
      whitelisted: true,
      endpointUrl: "http://localhost:4003/api/macro",
      providerAddress: PROVIDER_WALLETS.macro,
      historicalWinRate: 0.0,
      reliabilityScore: 1.0,
    },
  ];

  for (const nodeData of nodes) {
    const node = await prisma.alphaNode.create({ data: nodeData });
    console.log(
      `✅ Created node: ${node.title} | provider: ${node.providerAddress} | endpoint: ${node.endpointUrl}`
    );
  }

  console.log("\n📊 Seeding finished successfully!");
  console.log(
    "\n⚠️  NOTE: Set NODE_WALLET_MICROSTRUCTURE / NODE_WALLET_SENTIMENT / NODE_WALLET_MACRO " +
    "in your .env to override the default provider wallet addresses."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });