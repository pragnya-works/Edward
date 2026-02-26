FROM node:22-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /home/node/edward

# Copy ONLY essential config files (no pre-installed deps)
COPY tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs ./
COPY package.json ./
COPY .gitignore ./

# Configure pnpm to use a consistent store location
RUN pnpm config set store-dir /home/node/.local/share/pnpm/store --global && \
    pnpm config set engine-strict true --global && \
    mkdir -p /home/node/.local/share/pnpm/store

# Create src directory structure
RUN mkdir -p src/app

# Copy the minimal template files
COPY src/ src/

# Sandbox doesn't need to run as root
RUN chown -R node:node /home/node/edward && \
    chown -R node:node /home/node/.local
USER node

# Default command
CMD ["sleep", "infinity"]
