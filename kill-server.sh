#!/bin/bash
cd "$(dirname "$0")"

# Kill existing server if running
if [ -f server.pid ]; then
	kill "$(cat server.pid)" 2>/dev/null && echo "Old server stopped"
	rm server.pid
fi
