# ==============================================================================
# Multi-Stage Production Dockerfile for SHEIN Order & Weight App
# Stage 1: Build React Frontend
# Stage 2: Production Node.js Backend Container with Embedded Frontend Build
# ==============================================================================

# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/shein-frontend

# Install dependencies
COPY shein-frontend/package*.json ./
RUN npm ci --silent

# Build production bundle
COPY shein-frontend/ ./
ENV NODE_ENV=production
RUN npm run build

# --- Stage 2: Production App Runner ---
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8081
ENV HOST=0.0.0.0

# Install production backend dependencies
COPY backend/package*.json ./backend/
RUN npm ci --prefix backend --omit=dev --silent

# Copy backend application source
COPY backend/ ./backend/

# Copy pre-built React frontend from builder stage
COPY --from=frontend-builder /app/shein-frontend/build ./shein-frontend/build

# Create unprivileged user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8081

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8081/health || exit 1

CMD ["node", "backend/server.js"]
