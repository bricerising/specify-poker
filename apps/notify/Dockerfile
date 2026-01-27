FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/notify/package.json apps/notify/tsconfig.json ./apps/notify/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

RUN npm ci -w @specify-poker/shared -w @specify-poker/notify

COPY apps/notify/src ./apps/notify/src
COPY apps/notify/proto ./apps/notify/proto
COPY packages/shared/src ./packages/shared/src

RUN npm run build --workspace=@specify-poker/shared && npm run build --workspace=@specify-poker/notify

RUN npm prune --omit=dev

EXPOSE 50055

CMD ["node", "apps/notify/dist/server.js"]
