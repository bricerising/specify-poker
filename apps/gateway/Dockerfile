FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/tsconfig.json ./apps/gateway/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

RUN npm ci -w @specify-poker/shared -w @specify-poker/gateway

COPY packages/shared/src ./packages/shared/src
COPY apps/gateway/src ./apps/gateway/src
COPY apps/gateway/proto ./apps/gateway/proto

RUN npm run build --workspace=@specify-poker/shared && npm run build --workspace=@specify-poker/gateway

RUN npm prune --omit=dev

EXPOSE 4000 9104

CMD ["node", "apps/gateway/dist/server.js"]
