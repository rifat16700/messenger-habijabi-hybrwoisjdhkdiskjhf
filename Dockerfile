FROM node:20-slim

WORKDIR /app

# Copy package files from server/
COPY server/package.json ./
RUN npm install --production

# Copy the rest of the server files
COPY server/ ./

# Expose port
EXPOSE 7860

CMD ["node", "index.js"]
