import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/nodes/register
 * 
 * Registration Handshake Endpoint
 * Allows data provider nodes to self-announce to the marketplace
 * 
 * Request Body:
 * {
 *   name: string,
 *   nodeType: string,
 *   category: string,
 *   endpointUrl: string,
 *   port: number,
 *   price: number,
 *   qualityScore: number,
 *   description: string,
 *   providerAddress: string,  // Wallet that receives x402 payments
 *   assetCoverage: string,
 *   granularity: string,
 *   apiVersion?: string
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate required fields
    const { title, nodeType, category, endpointUrl, providerAddress } = body;
    const description = body.description ?? (providerAddress ? `Pay to: ${providerAddress}` : undefined);

    if (!title || !endpointUrl) {
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          required: ['title', 'endpointUrl'],
          received: { title, endpointUrl }
        }, 
        { status: 400 }
      );
    }
    
    // Validate providerAddress format (Ethereum address)
    if (providerAddress && !/^0x[a-fA-F0-9]{40}$/.test(providerAddress)) {
      return NextResponse.json(
        { 
          error: 'Invalid providerAddress format',
          details: 'Must be a valid Ethereum address (0x + 40 hex chars)'
        }, 
        { status: 400 }
      );
    }
    
    // No port conflict check needed
    
    // Upsert node - allow re-registration to update metadata
    const node = await prisma.alphaNode.upsert({
      where: { endpointUrl },
      update: {
        title,
        nodeType,
        category,
        price: body.price ?? 0,
        ratings: body.ratings ?? 0,
        description,
        more_context: body.more_context,
        providerAddress,
        apiVersion: body.apiVersion ?? '1.0',
        lastUpdated: new Date(),
        registrationStatus: 'verified',
        status: 'active'
      },
      create: {
        title,
        nodeType,
        category,
        endpointUrl,
        price: body.price ?? 0,
        ratings: body.ratings ?? 0,
        latencyMs: body.latencyMs ?? 0,
        description,
        more_context: body.more_context,
        providerAddress,
        apiVersion: body.apiVersion ?? '1.0',
        status: 'active',
        registrationStatus: 'verified',
        registeredAt: new Date()
      }
    });

    console.log(`705 Node registered: ${node.title} (${node.id}) at ${node.endpointUrl}`);

    return NextResponse.json(
      { 
        success: true,
        nodeId: node.id,
        message: 'Node registered successfully',
        node: {
          id: node.id,
          title: node.title,
          endpointUrl: node.endpointUrl,
          providerAddress: node.providerAddress,
          status: node.status
        }
      }, 
      { status: 201 }
    );
    
  } catch (error: any) {
    console.error('❌ Registration error:', error);
    return NextResponse.json(
      { 
        error: 'Registration failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, 
      { status: 500 }
    );
  }
}

/**
 * GET /api/nodes/register
 * Returns registration status and requirements
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/nodes/register',
    method: 'POST',
    description: 'Self-registration endpoint for data provider nodes',
    requiredFields: ['title', 'endpointUrl'],
    optionalFields: [
      'nodeType', 'category', 'price', 'ratings', 
      'description', 'providerAddress', 'more_context', 
      'latencyMs', 'icon', 'apiVersion', 'healthCheckUrl'
    ],
    example: {
      title: 'Example Sentiment Node',
      nodeType: 'sentiment',
      category: 'Technical',
      endpointUrl: 'http://localhost:4002/api/sentiment',
      price: 0.5,
      ratings: 85,
      latencyMs: 0,
      description: 'Real-time sentiment analysis powered by AI',
      providerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      more_context: 'Permanent context for this node',
      icon: 'activity',
      apiVersion: '1.0',
      healthCheckUrl: 'http://localhost:4002/health'
    }
  });
}
