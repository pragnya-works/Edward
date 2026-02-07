#!/bin/bash

# Clear Concurrency Shell Wrapper
# This script clears all active concurrency slots for all users in Redis.

# Get the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( dirname "$DIR" )"

# Load environment variables from apps/api/.env if it exists
ENV_FILE="$ROOT_DIR/apps/api/.env"
if [ -f "$ENV_FILE" ]; then
    # Extract REDIS_HOST and REDIS_PORT, defaulting if not found
    REDIS_HOST=$(grep REDIS_HOST "$ENV_FILE" | cut -d '=' -f2)
    REDIS_PORT=$(grep REDIS_PORT "$ENV_FILE" | cut -d '=' -f2)
fi

REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}

# Check if redis-cli is installed
if command -v redis-cli &> /dev/null; then
    echo "📡 Connecting to Redis at $REDIS_HOST:$REDIS_PORT via redis-cli..."
    
    # Get keys matching the pattern
    KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --raw KEYS "user:concurrency:*")
    
    if [ -z "$KEYS" ]; then
        echo "✅ No active concurrency slots found."
    else
        # Count keys found (split by newline)
        COUNT=$(echo "$KEYS" | wc -l | xargs)
        echo "🔍 Found $COUNT concurrency keys. Deleting..."
        
        # Delete the keys
        echo "$KEYS" | xargs redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL > /dev/null
        echo "✨ All concurrency slots cleared successfully."
    fi
else
    echo "❌ Error: 'redis-cli' not found."
    echo "Please install Redis CLI or use a Redis management tool to delete keys matching 'user:concurrency:*'."
    exit 1
fi
