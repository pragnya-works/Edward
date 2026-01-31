FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /home/node/edward

# Copy template files
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig*.json vite.config.ts ./

# Configure pnpm to use a consistent store location
RUN pnpm config set store-dir /home/node/.local/share/pnpm/store --global && \
    mkdir -p /home/node/.local/share/pnpm/store

# Pre-install dependencies
RUN pnpm install || pnpm install --no-frozen-lockfile

# Copy the rest of the template
COPY . .

# Sandbox doesn't need to run as root
RUN chown -R node:node /home/node/edward && \
    chown -R node:node /home/node/.local
USER node

# Default command
CMD ["sleep", "infinity"]
