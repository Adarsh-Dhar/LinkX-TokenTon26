#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# --- AGENT CONFIGURATION ---
# Set these to control agent behavior from the shell
export AGENT_MODE="BALANCED"     # Options: ACCURATE, ECONOMY, BALANCED
export AGENT_MIN_ACCURACY=10   # Equivalent to minScore/threshold
export AGENT_MAX_COST=0.4     # Max USDC to spend per cycle
export AGENT_LOOP_INTERVAL_SEC=30   # 30 seconds for faster cycles
export AI_CALL_GAP_SEC=30            # 30 second gap between AI calls to prevent burst rate limiting
export CONTINUOUS_TRADING=true      # ENABLED: Allow same-direction re-entry when signal persists
export MIN_TRADE_INTERVAL_SEC=10    # Min seconds between consecutive same-direction swaps

echo "🚀 STARTING ALPHA CONSUMER (EXPERT MODE)"
echo "------------------------------------------------"

# Centralized log files
FRONTEND_LOG="/tmp/frontend.log"
DEMO_PROVIDERS_LOG="/tmp/demo_providers.log"
BACKEND_API_LOG="/tmp/backend_api.log"
AGENT_LOG="/tmp/agent.log"
SENTIMENT_LOG="/tmp/sentiment.log"
MACRO_LOG="/tmp/macro.log"
MICROSTRUCTURE_LOG="/tmp/microstructure.log"
LOG_TAIL_PIDS=()
AGENT_PY=""

ensure_agent_python() {
    # Always use workspace .venv if available
    if [ -x "$SCRIPT_DIR/.venv/bin/python3" ]; then
        AGENT_PY="$SCRIPT_DIR/.venv/bin/python3"
        return 0
    fi

    # Fallback to dedicated agent venv if it exists
    if [ -x "$SCRIPT_DIR/agent/venv/bin/python3" ]; then
        AGENT_PY="$SCRIPT_DIR/agent/venv/bin/python3"
        return 0
    fi

    AGENT_PY=""
    return 1
}


# 1. Cleanup
echo "🧹 Cleaning up..."
rm -f agent/override_state.json
pkill -f "python3.*agent" 2>/dev/null || true
pkill -f "[Pp]ython.*agent.main" 2>/dev/null || true
pkill -f "agent.main" 2>/dev/null || true
pkill -f "[Uu]vicorn.*agent.api:app" 2>/dev/null || true
rm -f /tmp/linkx_agent_autonomous_loop.lock 2>/dev/null || true
pkill -f "tail.*agent.log" 2>/dev/null || true
pkill -f "tail.*backend_api.log" 2>/dev/null || true
pkill -f "tail.*frontend.log" 2>/dev/null || true
pkill -f "node.*server"
pkill -f "node.*provider.js"
pkill -f "node.*registry.js"
pkill -f "next-server"
pkill -f "node_sentiment"
pkill -f "node_macro"
pkill -f "node_microstructure"
lsof -ti:8080 | xargs kill -9 2>/dev/null
lsof -ti:3050 | xargs kill -9 2>/dev/null
lsof -ti:3999 | xargs kill -9 2>/dev/null
# Kill any lingering processes on node ports (without sudo to avoid password prompt)
lsof -ti:4001 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:4002 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:4003 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:4004 2>/dev/null | xargs -r kill -9 2>/dev/null || true

# Start node services - prefer Docker if available, otherwise run directly
if docker info >/dev/null 2>&1; then
    echo "   ✅ Docker is running, starting nodes via docker-compose.nodes.yml..."
    docker compose -f "$SCRIPT_DIR/docker-compose.nodes.yml" down 2>/dev/null || true
    docker compose -f "$SCRIPT_DIR/docker-compose.nodes.yml" up -d 2>/dev/null || true
    echo "   ✅ Node services started in Docker containers"
    NODES_IN_DOCKER=true
else
    echo "   ⚠️  Docker is not running, nodes will be started directly below..."
    NODES_IN_DOCKER=false
fi
sleep 2


# 2. Start Registry/Discovery Service
echo "📒 Starting Registry/Discovery Service..."


echo "📡 Starting Demo Node Providers..."
node server/start_demo_providers.js > "$DEMO_PROVIDERS_LOG" 2>&1 &
DEMO_PROVIDERS_PID=$!
echo "   ✅ Demo Providers Launched (PID: $DEMO_PROVIDERS_PID)"
echo "🌐 Provider Microservices are now handled by start_demo_providers.js."
sleep 10  # Give providers time to start
# 5. Setup Database
echo "🗄️  Setting up Database..."
cd "$SCRIPT_DIR/frontend"
DB_PATH="$SCRIPT_DIR/agent/agent_state.db"
export DATABASE_URL="file:$DB_PATH"
npx prisma db push --accept-data-loss
npx prisma db seed



# 6. Start Backend API (agent/api.py)
echo "🔌 Starting Backend API (agent/api.py) if not already running..."
ensure_agent_python || true
if ! lsof -i:8080 | grep LISTEN > /dev/null 2>&1; then
        export DATABASE_URL="file:$DB_PATH"
        export PYTHONUNBUFFERED=1
        export DISABLE_API_AUTONOMOUS_LOOP=1
        cd "$SCRIPT_DIR"
        # Try to start Backend API (skip only if no usable python env)
        if [ -n "$AGENT_PY" ] && "$AGENT_PY" -c "import uvicorn" 2>/dev/null; then
            "$AGENT_PY" -m uvicorn agent.api:app --host 0.0.0.0 --port 8080 > "$BACKEND_API_LOG" 2>&1 &
            AGENT_API_PID=$!
            echo "   ✅ Backend API started (PID: $AGENT_API_PID)"
            sleep 3
        else
            echo "   ⏭️  Skipping Backend API (uvicorn not installed in available env)"
        fi
else
        echo "   ⚠️  Backend API already running on port 8080. Skipping start."
fi

# 6b. Start Autonomous Trading Agent
echo "🤖 Starting Autonomous Trading Agent..."
if [ -n "$AGENT_PY" ] && "$AGENT_PY" -c "import web3" 2>/dev/null; then
    "$AGENT_PY" -m agent.main > "$AGENT_LOG" 2>&1 &
        AGENT_PID=$!
        echo "   ✅ Trading Agent started (PID: $AGENT_PID)"
    echo "      📝 Log: tail -f $AGENT_LOG"
        sleep 3
else
        echo "   ❌ Agent not started: web3 missing in both agent/venv and .venv"
        echo "      Try: source .venv/bin/activate && pip install web3"
fi




# 7. Ensure Liquidity and Funds
export WALLET_PRIVATE_KEY="4J5m6SgcYKhNo7rfVxvPXTjmptPs8tuVpoCn55HDKyjnDhtRxmJ32tZ8gGF6TmaNPWU2gAoRS65bbFDPQv1FfRZx"
cd "$SCRIPT_DIR/contract"
echo "� Auto-funding and liquidity setup..."

# Check if Python is available

# Always prefer .venv Python for contract scripts if available, else fallback to AGENT_PY
CONTRACT_PY="$SCRIPT_DIR/.venv/bin/python3"
if [ ! -x "$CONTRACT_PY" ]; then
    CONTRACT_PY="$AGENT_PY"
fi

if [ -n "$CONTRACT_PY" ]; then
    echo "   🪙 Minting USDC tokens..."
    if "$CONTRACT_PY" mint_usdc.py; then
        echo "   ✅ USDC minted successfully"
    else
        echo "   ❌ USDC minting failed - check mint_usdc.py output"
    fi

    echo "   🦙 Minting WSOL tokens..."
    if "$CONTRACT_PY" mint_WSOL.py 1000; then
        echo "   ✅ WSOL minted successfully"
    else
        echo "   ❌ WSOL minting failed - check mint_wsol.py output"
    fi

    echo "   💧 Checking and adding liquidity..."
    if "$CONTRACT_PY" check_and_add_liquidity.py; then
        echo "   ✅ Liquidity check completed"
    else
        echo "   ❌ Liquidity setup failed - check check_and_add_liquidity.py output"
    fi
else
    echo "   ⚠️  Python not available - skipping auto-funding"
    echo "      Run manually: cd contract && python3 mint_usdc.py && python3 mint_wsol.py && python3 check_and_add_liquidity.py"
fi

cd "$SCRIPT_DIR"

# 8. Start Frontend
echo "🖥️  Starting Frontend..."
export DATABASE_URL="file:$DB_PATH"
cd "$SCRIPT_DIR/frontend"
pnpm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"
echo "   ✅ Frontend PID: $FRONTEND_PID"
echo "   ⏳ Waiting 15s for Frontend to boot..."
sleep 15



echo "✅ Frontend Online on http://localhost:3600"

# 9. Start Node Services (Sentiment, Macro, Microstructure)
echo ""
echo "📡 Starting Node Services..."
cd "$SCRIPT_DIR/server"
sleep 3

# Only start nodes directly if Docker is not managing them
if [ "$NODES_IN_DOCKER" = "false" ]; then
    echo "   🔗 Sentiment Node (port 4002)..."
    node node_sentiment.js > "$SENTIMENT_LOG" 2>&1 &
    SENTIMENT_PID=$!
    sleep 3

    echo "   🔗 Macro Node (port 4003)..."
    node node_macro.js > "$MACRO_LOG" 2>&1 &
    MACRO_PID=$!
    sleep 3

    echo "   🔗 Microstructure Node (port 4001)..."
    node node_microstructure.js > "$MICROSTRUCTURE_LOG" 2>&1 &
    MICROSTRUCTURE_PID=$!
    sleep 2
else
    echo "   ✅ Nodes already running in Docker containers"
    SENTIMENT_PID=""
    MACRO_PID=""
    MICROSTRUCTURE_PID=""
fi

# Stream only agent trade/data activity in this terminal
start_agent_focus_stream() {
    local file="$1"
    touch "$file"
    (
        tail -n 0 -F "$file" 2>/dev/null | awk '
            /\[Scout\]|\[Procurement\]|Paid research fees|\[Strategist\]|\[Position Change\]|\[Scale In\]|\[Hold\]|\[Executing\]|\[TradingEngine\]|\[x402\]|\[x402 Feed\]|\[x402 TX\]|\[x402 Tx Hash\]|\[SWAP TX\]|Swap confirmation|Swap Confirmed|\bTx:\b|\bTX:\b|Hash: 0x|0x[0-9a-fA-F]{64}|429 Too Many Requests|Scout Error|Strategist Error|Traceback|Exception|Error|Failed|failed|revert|reverted|IndentationError/ {
                print "[AGENT] " $0;
                fflush();
            }
        '
    ) &
    LOG_TAIL_PIDS+=("$!")
}

# Stream only transaction-related lines (x402 + swaps + hashes)
start_tx_stream() {
    local file="$1"
    touch "$file"
    (
        tail -n 0 -F "$file" 2>/dev/null | awk '
            /\[x402 TX\]|\[x402 Tx Hash\]|\[SWAP TX\]|Waiting for Swap confirmation|Swap Confirmed|\bTx:\s*0x|\bTX:\s*0x|Hash: 0x|Sent .* USDC .* Tx: 0x|0x[0-9a-fA-F]{64}/ {
                print "[TX] " $0;
                fflush();
            }
        '
    ) &
    LOG_TAIL_PIDS+=("$!")
}

start_agent_focus_stream "$AGENT_LOG"
start_tx_stream "$AGENT_LOG"

echo ""
echo "🟢 ALPHA CONSUMER FULLY OPERATIONAL"
echo ""
echo "📊 Running Services:"
echo "   ✅ Frontend:              http://localhost:3600"
echo "   ✅ Sentiment Node:        http://localhost:4002"
echo "   ✅ Macro Node:            http://localhost:4003"
echo "   ✅ Microstructure Node:   http://localhost:4001"
echo "   ✅ Demo Providers:        Running (5000-5047)"
echo ""
echo "📊 View Logs:"
echo "   ✅ Streaming only AGENT execution logs in this terminal:"
echo "      [AGENT] Procurement + execution + transaction hashes"
echo "   ✅ Streaming TX-only logs in this terminal:"
echo "      [TX] x402 payments + swap hashes"
echo "   (Raw files remain available in /tmp/*.log)"
echo ""
echo "🛑 To stop: Press Ctrl+C"
echo ""

shutdown_all() {
    echo ""
    echo "🛑 Shutting down services..."
    kill ${DEMO_PROVIDERS_PID:-} ${FRONTEND_PID:-} ${AGENT_API_PID:-} ${AGENT_PID:-} ${SENTIMENT_PID:-} ${MACRO_PID:-} ${MICROSTRUCTURE_PID:-} ${LOG_TAIL_PIDS[@]:-} 2>/dev/null || true
    pkill -f provider.js 2>/dev/null || true
    echo "✅ All services stopped"
    exit
}

trap shutdown_all SIGINT SIGTERM
wait