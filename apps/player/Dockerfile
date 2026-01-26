FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/player/package.json apps/player/tsconfig.json ./apps/player/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

RUN npm ci -w @specify-poker/shared -w @specify-poker/player

RUN mkdir -p /app/build-deps \
  && cd /app/build-deps \
  && npm init -y \
  && npm install --no-package-lock typescript@5.9.3 \
  && cp -R node_modules/typescript /app/node_modules/typescript \
  && mkdir -p /app/node_modules/.bin \
  && ln -sf ../typescript/bin/tsc /app/node_modules/.bin/tsc \
  && ln -sf ../typescript/bin/tsserver /app/node_modules/.bin/tsserver \
  && rm -rf /app/build-deps

COPY packages/shared/src ./packages/shared/src
COPY apps/player/src ./apps/player/src
COPY apps/player/proto ./apps/player/proto
COPY apps/player/migrations ./apps/player/migrations

RUN npm run build --workspace=@specify-poker/shared && npm run build --workspace=@specify-poker/player

RUN npm prune --omit=dev

EXPOSE 50052 9103

CMD ["node", "apps/player/dist/server.js"]
