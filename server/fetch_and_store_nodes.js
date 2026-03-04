// fetch_and_store_nodes.js
// Fetches data from all three nodes every minute and stores in the DB using Prisma

const { PrismaClient } = require('./frontend/node_modules/@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const NODES = [
  {
    name: 'Market Microstructure & Execution',
    url: 'http://localhost:4001/api/microstructure',
    nodeType: 'microstructure',
    category: 'market',
    port: 4001,
  },
  {
    name: 'Alternative Intelligence & Sentiment',
    url: 'http://localhost:4002/api/sentiment',
    nodeType: 'sentiment',
    category: 'sentiment',
    port: 4002,
  },
  {
    name: 'Supply Chain & Global Macro',
    url: 'http://localhost:4003/api/macro',
    nodeType: 'macro',
    category: 'macro',
    port: 4003,
  },
];

async function upsertAlphaNode(node, data) {
  return prisma.alphaNode.upsert({
    where: { endpointUrl: node.url },
    update: {
      name: node.name,
      nodeType: node.nodeType,
      category: node.category,
      port: node.port,
      description: data.description,
      price: 0.0,
      qualityScore: data.data.quality_score || 0,
      latencyMs: data.data.latency_ms || 0,
      assetCoverage: data.data.asset_coverage ? String(data.data.asset_coverage) : null,
      status: 'active',
      lastUpdated: new Date(),
    },
    create: {
      name: node.name,
      nodeType: node.nodeType,
      category: node.category,
      port: node.port,
      endpointUrl: node.url,
      description: data.description,
      price: 0.0,
      qualityScore: data.data.quality_score || 0,
      latencyMs: data.data.latency_ms || 0,
      assetCoverage: data.data.asset_coverage ? String(data.data.asset_coverage) : null,
      status: 'active',
      lastUpdated: new Date(),
      icon: 'activity',
      isPurchased: false,
      whitelisted: false,
    },
  });
}

async function storeDataLog(node, data) {
  return prisma.dataLog.create({
    data: {
      data: JSON.stringify(data.data),
      normalized: null,
      fetchedAt: new Date(),
    },
  });
}

async function fetchAndStore() {
  for (const node of NODES) {
    try {
      const res = await axios.get(node.url);
      const data = res.data;
      await upsertAlphaNode(node, data);
      await storeDataLog(node, data);
      console.log(`[${new Date().toISOString()}] Stored data for node: ${node.name}`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error fetching/storing for ${node.name}:`, err.message);
    }
  }
}

// Run every minute
fetchAndStore();
setInterval(fetchAndStore, 60 * 1000);
