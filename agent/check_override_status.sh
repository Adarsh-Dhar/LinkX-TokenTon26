#!/bin/bash
# Check Current Override Status
# Displays active risk threshold and forced bias settings

echo "📊 QUERYING CURRENT AGENT CONFIGURATION..."
echo ""

curl -X POST http://localhost:8080/agent/control/override \
     -H "Content-Type: application/json" \
     -d '{}'

echo ""
