FROM node:20-slim

# Install git and other utilities if needed
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install production dependencies
RUN npm install

# Copy all project files
COPY . .

# Build the React frontend production assets
RUN npm run build:render

# Expose the unified server port (3001)
EXPOSE 3001

# Set environment variables
ENV PORT=3001
ENV NODE_ENV=production

# Start the node server
CMD ["node", "server/index.js"]
