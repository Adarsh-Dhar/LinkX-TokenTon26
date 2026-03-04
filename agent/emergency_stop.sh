#!/bin/bash
# Emergency Stop - Freeze All Trading
# Sets bias to NEUTRAL to prevent any trade execution
# Agent continues monitoring and logging but takes no positions

curl -X POST http://localhost:8080/agent/control/override \
     -H "Content-Type: application/json" \
     -d '{"bias": "NEUTRAL"}'

echo ""
echo "🛑 EMERGENCY STOP ACTIVATED"
echo "   - All trading FROZEN (bias set to NEUTRAL)"
echo "   - Agent continues monitoring market"
echo "   - No positions will be opened regardless of signals"
echo "   - Use ./reset_overrides.sh to resume trading"
echo ""
