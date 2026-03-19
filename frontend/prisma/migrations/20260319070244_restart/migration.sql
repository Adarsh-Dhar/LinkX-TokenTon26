-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "amountIn" DOUBLE PRECISION NOT NULL,
    "amountOut" DOUBLE PRECISION NOT NULL,
    "priceInUsd" DOUBLE PRECISION NOT NULL,
    "priceOutUsd" DOUBLE PRECISION NOT NULL,
    "valueInUsd" DOUBLE PRECISION NOT NULL,
    "valueOutUsd" DOUBLE PRECISION NOT NULL,
    "realizedPnL" DOUBLE PRECISION NOT NULL,
    "pnlPercentage" DOUBLE PRECISION NOT NULL,
    "isWin" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "strategy" TEXT,
    "reasoning" TEXT,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlphaNode" (
    "id" TEXT NOT NULL,
    "registrationStatus" TEXT NOT NULL DEFAULT 'pending',
    "providerAddress" TEXT,
    "registeredAt" TIMESTAMP(3),
    "lastHealthCheck" TIMESTAMP(3),
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "title" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "description" TEXT,
    "more_context" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "endpointUrl" TEXT NOT NULL,
    "assetCoverage" TEXT,
    "granularity" TEXT,
    "historicalWinRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "reliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastPurchaseTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlphaNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValueUsd" DOUBLE PRECISION NOT NULL,
    "wrappedSolBalance" DOUBLE PRECISION NOT NULL,
    "usdcBalance" DOUBLE PRECISION NOT NULL,
    "otherBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alphaCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LogRating" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "averageRating" DOUBLE PRECISION NOT NULL,
    "totalRatings" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeDecision" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT,
    "txId" TEXT,
    "context" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentActivity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "nodeId" TEXT,
    "nodePrice" DOUBLE PRECISION,
    "nodeQuality" INTEGER,
    "utilityScore" DOUBLE PRECISION,
    "alphaPerUsdcRatio" DOUBLE PRECISION,
    "signalValue" DOUBLE PRECISION,
    "signalSource" TEXT,
    "tradeBias" TEXT,
    "tradeConfidence" DOUBLE PRECISION,
    "tradeReason" TEXT,
    "riskAction" TEXT,
    "riskReason" TEXT,
    "agentThought" TEXT,
    "metadata" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "txType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tokenIn" TEXT,
    "tokenOut" TEXT,
    "amountIn" DOUBLE PRECISION,
    "amountOut" DOUBLE PRECISION,
    "amountUsd" DOUBLE PRECISION,
    "priceImpact" DOUBLE PRECISION,
    "chainId" INTEGER,
    "network" TEXT,
    "blockNumber" INTEGER,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "nodeId" TEXT,
    "nodeName" TEXT,
    "dataType" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodePurchaseTransaction" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "pricePaid" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nodeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "toAddress" TEXT,
    "metadata" TEXT,
    "data" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodePurchaseTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TradeAlphaNodes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TradeAlphaNodes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_txHash_key" ON "Trade"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "AlphaNode_endpointUrl_key" ON "AlphaNode"("endpointUrl");

-- CreateIndex
CREATE UNIQUE INDEX "LogRating_txId_key" ON "LogRating"("txId");

-- CreateIndex
CREATE INDEX "RatingHistory_nodeId_timestamp_idx" ON "RatingHistory"("nodeId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_txHash_key" ON "Transaction"("txHash");

-- CreateIndex
CREATE INDEX "Transaction_txType_createdAt_idx" ON "Transaction"("txType", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NodePurchaseTransaction_txHash_key" ON "NodePurchaseTransaction"("txHash");

-- CreateIndex
CREATE INDEX "NodePurchaseTransaction_nodeName_timestamp_idx" ON "NodePurchaseTransaction"("nodeName", "timestamp");

-- CreateIndex
CREATE INDEX "NodePurchaseTransaction_timestamp_idx" ON "NodePurchaseTransaction"("timestamp");

-- CreateIndex
CREATE INDEX "_TradeAlphaNodes_B_index" ON "_TradeAlphaNodes"("B");

-- AddForeignKey
ALTER TABLE "LogRating" ADD CONSTRAINT "LogRating_txId_fkey" FOREIGN KEY ("txId") REFERENCES "NodePurchaseTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeDecision" ADD CONSTRAINT "TradeDecision_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodePurchaseTransaction" ADD CONSTRAINT "NodePurchaseTransaction_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "AlphaNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TradeAlphaNodes" ADD CONSTRAINT "_TradeAlphaNodes_A_fkey" FOREIGN KEY ("A") REFERENCES "AlphaNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TradeAlphaNodes" ADD CONSTRAINT "_TradeAlphaNodes_B_fkey" FOREIGN KEY ("B") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
