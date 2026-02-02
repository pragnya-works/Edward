FROM node:20-slim

# Install pnpm and basic tooling
RUN npm install -g pnpm && \
    apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/edward

# Configure pnpm store
RUN pnpm config set store-dir /home/node/.local/share/pnpm/store --global && \
    mkdir -p /home/node/.local/share/pnpm/store

# Set ownership
RUN chown -R node:node /home/node/edward && \
    chown -R node:node /home/node/.local

USER node

CMD ["sleep", "infinity"]
