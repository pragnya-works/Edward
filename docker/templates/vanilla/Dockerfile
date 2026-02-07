FROM node:20-slim

# Install pnpm and serve
RUN npm install -g pnpm serve

WORKDIR /home/node/edward

# Configure pnpm store
RUN pnpm config set store-dir /home/node/.local/share/pnpm/store --global && \
    mkdir -p /home/node/.local/share/pnpm/store

# Sandbox doesn't need to run as root
RUN chown -R node:node /home/node/edward && \
    chown -R node:node /home/node/.local
USER node

# Default command: Serve the current directory on port 3000
CMD ["serve", "-s", ".", "-l", "3000"]
