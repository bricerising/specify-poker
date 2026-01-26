FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY apps/gateway/package.json ./apps/gateway/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/
RUN npm install
COPY . .
RUN npm run build -w @specify-poker/shared && npm run build -w @specify-poker/gateway

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=builder /app/apps/gateway/package.json ./apps/gateway/package.json
COPY --from=builder /app/apps/gateway/proto ./apps/gateway/proto
COPY --from=builder /app/packages/shared ./packages/shared

EXPOSE 4000
CMD ["npm", "start", "-w", "@specify-poker/gateway"]
