#!/bin/bash
# Start all demo provider microservices using the new unified script

# Ensure Node.js is available
command -v node >/dev/null 2>&1 || { echo >&2 "Node.js is required but not installed. Aborting."; exit 1; }

# Start the demo providers (runs in foreground)
node ../server/start_demo_providers.js
