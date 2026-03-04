#!/usr/bin/env node
// Script to fetch data from all three demo providers and print the results

const axios = require('axios');

const nodes = [
  {
    name: 'Macro News AI',
    apiKey: 'demo-macro-news',
  },
  {
    name: 'Neural Oracle',
    apiKey: 'demo-neural-oracle',
  },
  {
    name: 'On-Chain Watcher',
    apiKey: 'demo-chain-watcher',
  },
];

// Use a dummy payment proof for testing
const paymentProof = 'test-payment-proof';

async function fetchNodeData(node) {
  try {
    const response = await axios.get('http://localhost:4100/data', {
      params: {
        apiKey: node.apiKey,
        nodeName: node.name,
      },
      headers: {
        'x-payment-proof': paymentProof,
      },
    });
    return { name: node.name, data: response.data };
  } catch (error) {
    return { name: node.name, error: error.response ? error.response.data : error.message };
  }
}

(async () => {
  const results = await Promise.all(nodes.map(fetchNodeData));
  results.forEach(result => {
    console.log(`\n=== ${result.name} ===`);
    if (result.data) {
      console.log('Data:', result.data);
    } else {
      console.log('Error:', result.error);
    }
  });
})();
