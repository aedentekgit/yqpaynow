# ---------- Stage 1: Build Frontend ----------
    FROM node:20 AS frontend-build
    WORKDIR /app/frontend
    COPY frontend/ .
    RUN npm install --legacy-peer-deps
    RUN npm run build
    
    # ---------- Stage 2: Backend + Integrated Frontend ----------
    FROM node:20
    WORKDIR /app
    
    # Install system dependencies for native modules
    RUN apt-get update && apt-get install -y \
        python3 \
        build-essential \
        libcairo2-dev \
        libpango1.0-dev \
        libjpeg-dev \
        libgif-dev \
        librsvg2-dev \
        && rm -rf /var/lib/apt/lists/*
    
    # Copy backend files first
    COPY backend/ ./backend
    
    # Install backend dependencies (skip Puppeteer Chromium download)
    WORKDIR /app/backend
    ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    RUN npm install --legacy-peer-deps --ignore-scripts
    RUN npm rebuild canvas --build-from-source
    
    # Copy frontend build output into backend/dist
    COPY --from=frontend-build /app/frontend/dist ./dist
    
    # Make Cloud Run use correct port
    ENV PORT=8080
    EXPOSE 8080
    
    # Start server.js
    CMD ["npm", "start"]
    