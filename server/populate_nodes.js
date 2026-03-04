#!/usr/bin/env node
// populate_nodes.js - Directly populate nodes into the database

const fs = require('fs');
const path = require('path');

// Load .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim();
    process.env[key.trim()] = value;
  }
});

// Force the correct database URL to match Prisma migrations
process.env.DATABASE_URL = 'file:/Users/adarsh/Documents/alpha-consumer/frontend/prisma/dev.db';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const NODES = [
  {
    name: 'Market Microstructure & Execution',
    title: 'Market Microstructure & Execution',
    url: 'http://localhost:4001/api/microstructure',
    nodeType: 'microstructure',
    category: 'market',
    description: 'Monitors order flow imbalances, market depth anomalies, and optimal execution paths. Detects frontrunning and MEV patterns.',
    price: 0.25,
    icon: 'activity',
    ratings: 0,
    latencyMs: 0,
    assetCoverage: '["WETH","USDC","DAI"]',
    granularity: null,
    historicalWinRate: 0.0,
    more_context: null,
  },
  {
    name: 'Alternative Intelligence & Sentiment',
    title: 'Alternative Intelligence & Sentiment',
    url: 'http://localhost:4002/api/sentiment',
    nodeType: 'sentiment',
    category: 'sentiment',
    description: 'Real-time sentiment analysis from social media, news outlets, and on-chain whale wallets. Capturing collective psychology.',
    price: 0.35,
    icon: 'activity',
    ratings: 0,
    latencyMs: 0,
    assetCoverage: '["WETH","USDC","DAI"]',
    granularity: null,
    historicalWinRate: 0.0,
    more_context: null,
  },
  {
    name: 'Supply Chain & Global Macro',
    title: 'Supply Chain & Global Macro',
    url: 'http://localhost:4003/api/macro',
    nodeType: 'macro',
    category: 'macro',
    description: 'Monitors large-scale economic and physical world data that impacts long-term asset valuations.',
    price: 0.65,
    icon: 'activity',
    ratings: 0,
    latencyMs: 0,
    assetCoverage: '["WETH","USDC","DAI"]',
    granularity: null,
    historicalWinRate: 0.0,
    more_context: null,
  },
];

async function populateNodes() {
  console.log('🚀 Starting node population...');
  
  for (const node of NODES) {
    try {
            const created = await prisma.alphaNode.create({
              data: {
                title: node.title,
                nodeType: node.nodeType,
                category: node.category,
                endpointUrl: node.url,
                description: node.description,
                price: node.price,
                icon: node.icon,
                ratings: node.ratings,
                latencyMs: node.latencyMs,
                historicalWinRate: node.historicalWinRate,
                more_context: node.more_context,
                status: 'active',
                isPurchased: false,
                whitelisted: false,
                registrationStatus: 'pending',
                apiVersion: '1.0',
                healthStatus: 'unknown',
                lastUpdated: new Date(),
                updatedAt: new Date(),
                createdAt: new Date(),
                // providerAddress, registeredAt, healthCheckUrl, lastHealthCheck, lastPurchaseTime are left null
              },
            });
      console.log(`✅ Created node: ${node.name} (Quality: ${node.qualityScore}, Price: $${node.price})`);
    } catch (err) {
      console.error(`❌ Error creating node ${node.name}:`, err.message);
    }
  }
  
  // Fetch all nodes to verify
  const allNodes = await prisma.alphaNode.findMany();
  console.log(`\n📊 Database now contains ${allNodes.length} nodes:`);
  allNodes.forEach((n) => {
    console.log(`   - ${n.name} (${n.nodeType}): Quality=${n.qualityScore}, Price=$${n.price}`);
  });
  
  await prisma.$disconnect();
  console.log('\n✅ Node population complete!');
}

populateNodes().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
