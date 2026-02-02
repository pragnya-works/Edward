FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /home/node/edward

# Copy ONLY essential config files (no pre-installed deps)
COPY tsconfig.json next.config.ts eslint.config.mjs ./

# Create minimal package.json with only scripts (deps installed dynamically)
RUN echo '{"name":"edward-nextjs","version":"1.0.0","private":true,"scripts":{"dev":"next dev","build":"next build","start":"next start"},"dependencies":{},"devDependencies":{}}' > package.json

# Configure pnpm to use a consistent store location
RUN pnpm config set store-dir /home/node/.local/share/pnpm/store --global && \
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