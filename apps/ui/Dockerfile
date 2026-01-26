FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/ui/package.json apps/ui/tsconfig.json ./apps/ui/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

RUN npm ci

COPY packages/shared/src ./packages/shared/src
COPY apps/ui/src ./apps/ui/src
COPY apps/ui/server.mjs ./apps/ui/server.mjs
COPY apps/ui/public ./apps/ui/public
RUN npm run build --workspace=@specify-poker/shared && npm run build --workspace=@specify-poker/ui

EXPOSE 3000

CMD ["node", "apps/ui/server.mjs"]
