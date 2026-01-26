FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/balance/package.json apps/balance/tsconfig.json ./apps/balance/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

RUN npm ci -w @specify-poker/shared -w @specify-poker/balance

RUN mkdir -p /app/build-deps \
  && cd /app/build-deps \
  && npm init -y \
  && npm install --no-package-lock typescript@5.9.3 \
  && cp -R node_modules/typescript /app/node_modules/typescript \
  && mkdir -p /app/node_modules/.bin \
  && ln -sf ../typescript/bin/tsc /app/node_modules/.bin/tsc \
  && ln -sf ../typescript/bin/tsserver /app/node_modules/.bin/tsserver \
  && rm -rf /app/build-deps

COPY apps/balance/src ./apps/balance/src
COPY packages/shared/src ./packages/shared/src
COPY apps/balance/proto/balance.proto ./apps/balance/proto/balance.proto

RUN npm run build --workspace=@specify-poker/shared && npm run build --workspace=@specify-poker/balance

RUN npm prune --omit=dev

EXPOSE 3002 50051

CMD ["node", "apps/balance/dist/server.js"]
