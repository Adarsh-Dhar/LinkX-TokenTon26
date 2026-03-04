#!/bin/bash
# Simple script to start all Node services

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "📡 Starting Alpha Node Services..."
echo "===================================="
echo ""

# Ensure no old processes
lsof -ti:4001 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:4002 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:4003 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 2

cd "$SCRIPT_DIR/server"

echo "🔗 Starting Sentiment Node (port 4002)..."
node node_sentiment.js > /tmp/sentiment.log 2>&1 &
SENTIMENT_PID=$!
sleep 3

echo "🔗 Starting Macro Node (port 4003)..."
node node_macro.js > /tmp/macro.log 2>&1 &
MACRO_PID=$!
sleep 3

echo "🔗 Starting Microstructure Node (port 4001)..."
node node_microstructure.js > /tmp/microstructure.log 2>&1 &
MICROSTRUCTURE_PID=$!
sleep 3

echo ""
echo "✅ All Nodes Started!"
echo ""
echo "📊 Node Services Status:"
sleep 2
lsof -i :4001,:4002,:4003 2>/dev/null | grep LISTEN | awk '{print "   ✅", $1, "on", $9}'

echo ""
echo "📋 Node Logs:"
echo "   Sentiment: tail -f /tmp/sentiment.log"
echo "   Macro: tail -f /tmp/macro.log"
echo "   Microstructure: tail -f /tmp/microstructure.log"
echo ""

trap "kill $SENTIMENT_PID $MACRO_PID $MICROSTRUCTURE_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
