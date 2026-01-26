FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/player/package.json apps/player/tsconfig.json ./apps/player/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

RUN npm ci

COPY packages/shared/src ./packages/shared/src
COPY apps/player/src ./apps/player/src
COPY apps/player/proto ./apps/player/proto
COPY apps/player/migrations ./apps/player/migrations

RUN npm run build --workspace=@specify-poker/shared && npm run build --workspace=@specify-poker/player

EXPOSE 50052 9103

CMD ["node", "apps/player/dist/server.js"]
