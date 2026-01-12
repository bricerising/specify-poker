FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/balance/package.json apps/balance/tsconfig.json ./apps/balance/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN npm ci

COPY apps/balance/src ./apps/balance/src
COPY packages/shared/src ./packages/shared/src
COPY apps/balance/proto/balance.proto ./apps/balance/proto/balance.proto

RUN npm run build --workspace=@specify-poker/balance

EXPOSE 3002 50051

CMD ["node", "apps/balance/dist/server.js"]
