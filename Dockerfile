# Stage 1: Build & Prisma Generate
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma compatibility
RUN apt-get update -y && apt-get install -y openssl


# Copy package and lock files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies for Prisma CLI)
RUN npm install

# Copy application code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Stage 2: Production Image
FROM node:20-slim

WORKDIR /app

# Install OpenSSL for Prisma runtime
RUN apt-get update -y && apt-get install -y openssl


# Copy built assets and dependencies from builder
COPY --from=builder /app ./

# Expose API port
EXPOSE 3000

# Start script that creates DB tables (if needed) and runs the app
COPY start.sh ./
RUN chmod +x start.sh

CMD ["./start.sh"]
