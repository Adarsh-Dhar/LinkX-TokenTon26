#!/usr/bin/env node

// This script launches all demo provider microservices
const { spawn } = require('child_process');
const path = require('path');

// Launch the providers using the bash script
const PROVIDERS_SCRIPT = path.join(__dirname, 'start_providers.sh');

const child = spawn('bash', [PROVIDERS_SCRIPT], {
  stdio: 'inherit',
  env: process.env,
  cwd: __dirname,
});

child.on('close', (code) => {
  process.exit(code);
});
