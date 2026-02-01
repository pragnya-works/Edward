FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /home/node/edward

# Copy ONLY essential config files (no pre-installed deps)
COPY tsconfig*.json vite.config.ts ./

# Create minimal package.json with only scripts (deps installed dynamically)
RUN echo '{"name":"edward-vite-react","version":"1.0.0","private":true,"type":"module","scripts":{"dev":"vite","build":"vite build","preview":"vite preview"},"dependencies":{},"devDependencies":{}}' > package.json

# Configure pnpm to use a consistent store location
RUN pnpm config set store-dir /home/node/.local/share/pnpm/store --global && \
    mkdir -p /home/node/.local/share/pnpm/store

# Create src directory structure
RUN mkdir -p src

# Copy the minimal template files
COPY src/ src/
COPY index.html ./

# Sandbox doesn't need to run as root
RUN chown -R node:node /home/node/edward && \
    chown -R node:node /home/node/.local
USER node

# Default command
CMD ["sleep", "infinity"]
