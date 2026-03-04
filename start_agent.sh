#!/bin/bash
# Start the Agent Service
# This runs the autonomous trading agent that buys data from nodes and executes trades

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🤖 Starting Agent Service..."
echo "===================================="

# Ensure venv exists
if [ ! -d "agent/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv agent/venv
fi

# Activate venv and install requirements
source agent/venv/bin/activate
pip install -q -r agent/requirements.txt 2>/dev/null

# Start the agent
echo "📡 Starting Autonomous Trading Agent..."
echo "   - Fetching data from Alpha Nodes"
echo "   - Executing trades with available liquidity"
echo "   - Recording transactions to database"
echo ""

cd "$SCRIPT_DIR"
python3 -m agent.main > /tmp/agent.log 2>&1 &
AGENT_PID=$!

echo "✅ Agent started (PID: $AGENT_PID)"
echo "📊 Monitor with: tail -f /tmp/agent.log"
echo ""

trap "echo ''; echo '🛑 Stopping agent...'; kill $AGENT_PID 2>/dev/null; echo '✅ Agent stopped'; exit" SIGINT SIGTERM
wait $AGENT_PID
