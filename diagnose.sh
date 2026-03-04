#!/bin/bash
# Agent Diagnostics - Check why agents aren't buying data

echo "🔍 ALPHA CONSUMER DIAGNOSTIC"
echo "===================================="
echo ""

echo "1️⃣  CHECKING SYSTEM SERVICES..."
echo "   Frontend (port 3600):"
curl -s http://localhost:3600/api/dashboard/stats 2>&1 | head -1 || echo "      ❌ Not responding"

echo "   Sentiment Node (port 4002):"
curl -s http://localhost:4002/api/sentiment 2>&1 | head -1 || echo "      ❌ Not responding"

echo "   Macro Node (port 4003):"
curl -s http://localhost:4003/api/macro 2>&1 | head -1 || echo "      ❌ Not responding"

echo "   Microstructure Node (port 4001):"
curl -s http://localhost:4001/api/microstructure 2>&1 | head -1 || echo "      ❌ Not responding"

echo ""
echo "2️⃣  CHECKING AGENT STATUS..."
ps aux | grep -E "python3.*agent|main.py" | grep -v grep | wc -l | xargs echo "   Agent processes running:"

echo ""
echo "3️⃣  CHECKING DATABASE RECORDS..."
echo "   Trades:"
sqlite3 agent/agent_state.db "SELECT COUNT(*) FROM Trade;" 2>/dev/null || echo "      ❌ DB not accessible"

echo "   Agent Activities:"
sqlite3 agent/agent_state.db "SELECT COUNT(*) FROM AgentActivity;" 2>/dev/null

echo "   Recent Purchases:"
sqlite3 agent/agent_state.db "SELECT node_name, COUNT(*) as purchases FROM DataLog GROUP BY node_name LIMIT 5;" 2>/dev/null

echo ""
echo "4️⃣  CHECKING WALLET..."
grep "WALLET_PRIVATE_KEY" .env 2>/dev/null | head -1 | sed 's/=.*/=***CONFIGURED***/' || echo "   ❌ No wallet configured"

echo ""
echo "5️⃣  CHECKING LOGS..."
echo "   Agent Log:"
[ -f /tmp/agent.log ] && wc -l /tmp/agent.log || echo "      ❌ No agent log found"

echo "   Sentiment Node Log:"
[ -f /tmp/sentiment.log ] && tail -3 /tmp/sentiment.log || echo "      ❌ No sentiment log"

echo ""
echo "📋 SUMMARY:"
echo "   To enable trading, ensure:"
echo "   1. All nodes are running (start_all.sh)"
echo "   2. Agent is running (start_agent.sh)"
echo "   3. Nodes are registered with frontend"
echo "   4. Agent has access to funds"
echo ""
