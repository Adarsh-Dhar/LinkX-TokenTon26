/*
  Warnings:

  - You are about to drop the column `apiVersion` on the `AlphaNode` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `AlphaNode` table. All the data in the column will be lost.
  - You are about to drop the column `healthCheckUrl` on the `AlphaNode` table. All the data in the column will be lost.
  - You are about to drop the column `icon` on the `AlphaNode` table. All the data in the column will be lost.
  - You are about to drop the column `latencyMs` on the `AlphaNode` table. All the data in the column will be lost.
  - You are about to drop the column `ratings` on the `AlphaNode` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlphaNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationStatus" TEXT NOT NULL DEFAULT 'pending',
    "providerAddress" TEXT,
    "registeredAt" DATETIME,
    "lastHealthCheck" DATETIME,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "title" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "description" TEXT,
    "more_context" TEXT,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "endpointUrl" TEXT NOT NULL,
    "assetCoverage" TEXT,
    "granularity" TEXT,
    "historicalWinRate" REAL NOT NULL DEFAULT 0.0,
    "reliabilityScore" REAL NOT NULL DEFAULT 1.0,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastPurchaseTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AlphaNode" ("assetCoverage", "createdAt", "description", "endpointUrl", "granularity", "healthStatus", "historicalWinRate", "id", "isPurchased", "lastHealthCheck", "lastPurchaseTime", "lastUpdated", "more_context", "nodeType", "price", "providerAddress", "registeredAt", "registrationStatus", "reliabilityScore", "status", "title", "updatedAt", "whitelisted") SELECT "assetCoverage", "createdAt", "description", "endpointUrl", "granularity", "healthStatus", "historicalWinRate", "id", "isPurchased", "lastHealthCheck", "lastPurchaseTime", "lastUpdated", "more_context", "nodeType", "price", "providerAddress", "registeredAt", "registrationStatus", "reliabilityScore", "status", "title", "updatedAt", "whitelisted" FROM "AlphaNode";
DROP TABLE "AlphaNode";
ALTER TABLE "new_AlphaNode" RENAME TO "AlphaNode";
CREATE UNIQUE INDEX "AlphaNode_endpointUrl_key" ON "AlphaNode"("endpointUrl");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
