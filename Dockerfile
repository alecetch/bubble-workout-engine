# Stage 1: build the React frontend
FROM node:20-alpine AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
ARG CACHEBUST=1
COPY web/ .
RUN npm run build

# Stage 2: production API image
FROM node:20-alpine
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --omit=dev
COPY api/ .
COPY migrations/ ./migrations/
COPY --from=web-build /web/dist ./public/web
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
