#!/bin/bash
cd "$(dirname "$0")"

bash ./kill-server.sh

# Start new server in background
nohup node Server.js > server.log 2>&1 &
echo $! > server.pid
echo "Server started (PID: $(cat server.pid))"
tail -n +1 -f server.log
