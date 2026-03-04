#!/usr/bin/env node

/**
 * Generic Provider Launcher
 * Maps category and competitor indices to actual node types
 * Category 0,1 = microstructure, 2,3 = sentiment, 4,5 = macro, etc.
 */

const path = require('path');
const nodeModules = {
  0: 'node_microstructure.js',
  1: 'node_microstructure.js',
  2: 'node_sentiment.js',
  3: 'node_sentiment.js',
  4: 'node_macro.js',
  5: 'node_macro.js',
};

const category = parseInt(process.argv[2]) || 0;
const competitor = parseInt(process.argv[3]) || 0;

// Map to node type - for now just cycle through the 3 main node types
const nodeIndex = (category + competitor) % 3;
const nodeFiles = ['node_microstructure.js', 'node_sentiment.js', 'node_macro.js'];
const nodeFile = nodeFiles[nodeIndex];

try {
  require(path.join(__dirname, nodeFile));
} catch (err) {
  console.error(`Failed to start provider: ${err.message}`);
  process.exit(1);
}
