import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simulate data for different node types

// Helper for rival bias
function getRivalBias(nodeName: string) {
  // If node name contains 'A', use one bias, if 'B', use another
  if (/\bA\b|\(A\)|\-A$|_A$|\sA$|\bAlpha\b/i.test(nodeName)) return 1;
  if (/\bB\b|\(B\)|\-B$|_B$|\sB$|\bBeta\b/i.test(nodeName)) return -1;
  // Fallback: alternate by char code sum
  return nodeName.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
}

// Realistic, bounded, rival-style data simulation
function generateSimulatedData(category: string, nodeName: string) {
  const bias = getRivalBias(nodeName);
  switch (category) {
    case 'Sentiment': {
      // Sentiment: -0.7 to 0.9, rivals have opposite bias
      let base = 0.1 + bias * 0.2;
      let noise = (Math.random() - 0.5) * 0.3;
      let sentiment = Math.max(-0.7, Math.min(0.9, base + noise));
      return { sentiment: sentiment.toFixed(3) };
    }
    case 'Volatility': {
      // Volatility: 0.7 to 1.3, rivals have different mean
      let base = 1.0 + bias * 0.1;
      let noise = (Math.random() - 0.5) * 0.1;
      let volatility = Math.max(0.7, Math.min(1.3, base + noise));
      return { volatility: volatility.toFixed(3) };
    }
    case 'On-Chain': {
      // On-chain metric: 1000-10000, rivals have different means
      let base = 5000 + bias * 1500;
      let noise = (Math.random() - 0.5) * 2000;
      let value = Math.max(1000, Math.min(10000, base + noise));
      return { value: value.toFixed(0) };
    }
    case 'Technical': {
      // Technical: 30-70, rivals have different mean
      let base = 50 + bias * 10;
      let noise = (Math.random() - 0.5) * 10;
      let value = Math.max(30, Math.min(70, base + noise));
      return { value: value.toFixed(2) };
    }
    case 'Whale Watch': {
      // Whale: 1-20, rivals have different mean
      let base = 10 + bias * 4;
      let noise = (Math.random() - 0.5) * 6;
      let value = Math.max(1, Math.min(20, base + noise));
      return { value: value.toFixed(0) };
    }
    case 'News AI': {
      // News: 0-1, rivals have different mean
      let base = 0.5 + bias * 0.2;
      let noise = (Math.random() - 0.5) * 0.2;
      let value = Math.max(0, Math.min(1, base + noise));
      return { value: value.toFixed(2) };
    }
    case 'Macro': {
      // Macro: 0.8-1.2, rivals have different mean
      let base = 1.0 + bias * 0.1;
      let noise = (Math.random() - 0.5) * 0.1;
      let value = Math.max(0.8, Math.min(1.2, base + noise));
      return { value: value.toFixed(2) };
    }
    default:
      // Fallback: 0-1, rivals have different mean
      let base = 0.5 + bias * 0.2;
      let noise = (Math.random() - 0.5) * 0.2;
      let value = Math.max(0, Math.min(1, base + noise));
      return { value: value.toFixed(2) };
  }
}

export async function POST(req: NextRequest, { params }: { params: { nodeId: string } }) {
  const nodeId = params.nodeId;
  const paymentProof = req.headers.get('X-402-Payment-Proof');

  // Fetch node from DB
  const node = await prisma.alphaNode.findUnique({ where: { id: nodeId } });
  if (!node) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }

  // Check for payment proof (tx hash from x402 payment)
  if (!paymentProof) {
    return NextResponse.json({
      error: 'Payment Required',
      price: node.price,
      recipient: process.env.PROVIDER_ADDRESS || "29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL",
      nodeId: node.id,
      nodeName: node.name,
    }, { status: 402 });
  }

  // TODO: Verify tx hash on Solana blockchain
  // For now, accept any tx hash format that looks valid (0x + 64 hex chars)
  const isValidTxHash = /^0x[a-fA-F0-9]{64}$/.test(paymentProof);
  if (!isValidTxHash) {
    console.warn(`[Feed] Invalid tx hash format: ${paymentProof}`);
    // In production, should verify the tx actually transferred USDC to provider
    // For development, allow it through
  }

  // Log successful access
  console.log(`[Feed] Access granted to node ${nodeId} with proof ${paymentProof.slice(0, 10)}...`);

  // Generate and return locked data
  const data = generateSimulatedData(node.category, node.name);
  return NextResponse.json({
    success: true,
    nodeId,
    nodeName: node.name,
    category: node.category,
    signal: data,
    timestamp: new Date().toISOString(),
    proofVerified: isValidTxHash,
  });
}
