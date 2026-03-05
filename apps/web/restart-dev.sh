#!/bin/bash

# Script to clean and restart the Next.js dev server
# Usage: ./restart-dev.sh or bash restart-dev.sh

set -e

echo "🛑 Stopping all Next.js dev server processes..."

# Kill all Next.js dev server processes
pkill -f "next dev" 2>/dev/null || echo "No Next.js dev processes found"

# Wait a moment for processes to terminate
sleep 2

echo "🧹 Cleaning .next directory..."

# Remove .next directory if it exists
if [ -d ".next" ]; then
  rm -rf .next
  echo "✅ .next directory removed"
else
  echo "ℹ️  .next directory doesn't exist"
fi

echo "🚀 Starting Next.js dev server..."
echo ""

# Start the dev server
npm run dev
