FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev

# Install admin dependencies
COPY admin/package*.json ./admin/
RUN npm ci --include=dev --prefix admin

COPY . .
RUN npm run build:all

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/admin/dist ./admin/dist
COPY --from=builder /app/specs ./specs

EXPOSE 3000

CMD ["node", "dist/index.js"]
