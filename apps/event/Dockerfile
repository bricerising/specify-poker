FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/event/package.json apps/event/tsconfig.json ./apps/event/

RUN npm ci --omit=dev -w @specify-poker/event

RUN mkdir -p /app/build-deps \
  && cd /app/build-deps \
  && npm init -y \
  && npm install --no-package-lock typescript@5.9.3 @types/node@20.19.27 @types/pg@8.16.0 @types/uuid@9.0.8 \
  && cp -R node_modules/* /app/node_modules/ \
  && rm -rf /app/build-deps

COPY apps/event/src ./apps/event/src
COPY apps/event/proto ./apps/event/proto

RUN node node_modules/typescript/bin/tsc -p apps/event/tsconfig.json

RUN npm prune --omit=dev

EXPOSE 50054

CMD ["node", "apps/event/dist/server.js"]
