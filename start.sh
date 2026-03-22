#!/bin/bash
# MSG WhatsApp Clone — Start Everything
echo "🚀 Starting MSG..."

# MongoDB auto-starts via brew services on boot — just verify it's running
if ! mongosh --quiet --eval "db.adminCommand({ping:1})" > /dev/null 2>&1; then
  echo "⚡ Starting MongoDB..."
  brew services start mongodb-community@7.0
  sleep 2
fi
echo "✅ MongoDB is running"

# Start API + Web dev servers
echo "⚡ Starting API + Web servers..."
echo "   API  → http://localhost:3000"
echo "   Web  → https://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "──────────────────────────────────"
npm run dev
