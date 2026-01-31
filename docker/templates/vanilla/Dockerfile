FROM node:20-slim

# Install serve
RUN npm install -g serve

WORKDIR /home/node/edward

# Sandbox doesn't need to run as root
RUN chown -R node:node /home/node/edward
USER node

# Default command: Serve the current directory on port 3000
CMD ["serve", "-s", ".", "-l", "3000"]
