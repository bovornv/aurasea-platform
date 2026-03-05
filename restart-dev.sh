#!/bin/bash

# Script to clean and restart the Next.js dev server from project root
# Usage: ./restart-dev.sh or bash restart-dev.sh

set -e

echo "🛑 Stopping all Next.js dev server processes..."

# Kill all Next.js dev server processes
pkill -f "next dev" 2>/dev/null || echo "No Next.js dev processes found"

# Wait a moment for processes to terminate
sleep 2

echo "🧹 Cleaning .next directory in apps/web..."

# Remove .next directory if it exists
if [ -d "apps/web/.next" ]; then
  rm -rf apps/web/.next
  echo "✅ .next directory removed"
else
  echo "ℹ️  .next directory doesn't exist"
fi

echo "🚀 Starting dev server from project root..."
echo ""

# Start the dev server from project root (uses turbo)
npm run dev
