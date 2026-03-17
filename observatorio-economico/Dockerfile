# ===============================
# Stage 1 — Build React App
# ===============================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json package-lock.json ./

RUN npm install

# Copy remaining source code
COPY . .

# Build production bundle
RUN npm run build


# ===============================
# Stage 2 — Serve with Nginx
# ===============================
FROM nginx:alpine

# Remove default nginx config
RUN rm -rf /usr/share/nginx/html/*

# Copy built app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
