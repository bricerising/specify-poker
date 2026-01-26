FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/game/package.json apps/game/tsconfig.json ./apps/game/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

# Copy protos from other apps that we depend on
COPY apps/balance/proto ./apps/balance/proto
COPY apps/event/proto ./apps/event/proto
COPY apps/game/proto ./apps/game/proto

RUN npm ci

COPY packages/shared/src ./packages/shared/src
COPY apps/game/src ./apps/game/src

RUN npm run build --workspace=@specify-poker/shared && npm run build --workspace=@specify-poker/game

EXPOSE 50053

CMD ["node", "apps/game/dist/server.js"]
