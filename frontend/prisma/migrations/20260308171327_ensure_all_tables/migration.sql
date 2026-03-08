-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenIn" TEXT NOT NULL,
    "tokenOut" TEXT NOT NULL,
    "amountIn" REAL NOT NULL,
    "amountOut" REAL NOT NULL,
    "priceInUsd" REAL NOT NULL,
    "priceOutUsd" REAL NOT NULL,
    "valueInUsd" REAL NOT NULL,
    "valueOutUsd" REAL NOT NULL,
    "realizedPnL" REAL NOT NULL,
    "pnlPercentage" REAL NOT NULL,
    "isWin" BOOLEAN NOT NULL,
    "confidence" REAL NOT NULL,
    "strategy" TEXT,
    "reasoning" TEXT,
    "txHash" TEXT NOT NULL,
    "blockNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AlphaNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationStatus" TEXT NOT NULL DEFAULT 'pending',
    "providerAddress" TEXT,
    "apiVersion" TEXT DEFAULT '1.0',
    "registeredAt" DATETIME,
    "healthCheckUrl" TEXT,
    "lastHealthCheck" DATETIME,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "title" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "more_context" TEXT,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "endpointUrl" TEXT NOT NULL,
    "icon" TEXT,
    "ratings" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "assetCoverage" TEXT,
    "granularity" TEXT,
    "historicalWinRate" REAL NOT NULL DEFAULT 0.0,
    "reliabilityScore" REAL NOT NULL DEFAULT 1.0,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastPurchaseTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValueUsd" REAL NOT NULL,
    "wrappedSolBalance" REAL NOT NULL,
    "usdcBalance" REAL NOT NULL,
    "otherBalance" REAL NOT NULL DEFAULT 0,
    "alphaCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "SystemState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LogRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "txId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LogRating_txId_fkey" FOREIGN KEY ("txId") REFERENCES "NodePurchaseTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "averageRating" REAL NOT NULL,
    "totalRatings" INTEGER NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradeDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT,
    "txId" TEXT,
    "context" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeDecision_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "nodeId" TEXT,
    "nodePrice" REAL,
    "nodeQuality" INTEGER,
    "utilityScore" REAL,
    "alphaPerUsdcRatio" REAL,
    "signalValue" REAL,
    "signalSource" TEXT,
    "tradeBias" TEXT,
    "tradeConfidence" REAL,
    "tradeReason" TEXT,
    "riskAction" TEXT,
    "riskReason" TEXT,
    "agentThought" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "txHash" TEXT NOT NULL,
    "txType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tokenIn" TEXT,
    "tokenOut" TEXT,
    "amountIn" REAL,
    "amountOut" REAL,
    "amountUsd" REAL,
    "priceImpact" REAL,
    "chainId" INTEGER,
    "network" TEXT,
    "blockNumber" INTEGER,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "nodeId" TEXT,
    "nodeName" TEXT,
    "dataType" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "confirmedAt" DATETIME
);

-- CreateTable
CREATE TABLE "NodePurchaseTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "txHash" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "pricePaid" REAL NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nodeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "toAddress" TEXT,
    "metadata" TEXT,
    "data" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NodePurchaseTransaction_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "AlphaNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_TradeAlphaNodes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TradeAlphaNodes_A_fkey" FOREIGN KEY ("A") REFERENCES "AlphaNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TradeAlphaNodes_B_fkey" FOREIGN KEY ("B") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "_TradeAlphaNodes_AB_unique" ON "_TradeAlphaNodes"("A", "B");

-- CreateIndex
CREATE INDEX "_TradeAlphaNodes_B_index" ON "_TradeAlphaNodes"("B");
