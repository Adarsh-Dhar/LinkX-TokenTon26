#!/bin/bash
# Proxy script to call the agent/start_demo_providers.sh from project root

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_SCRIPT="$SCRIPT_DIR/agent/start_demo_providers.sh"

if [ -f "$AGENT_SCRIPT" ]; then
    bash "$AGENT_SCRIPT" "$@"
else
    echo "Error: $AGENT_SCRIPT not found."
    exit 1
fi
