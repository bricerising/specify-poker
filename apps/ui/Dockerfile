FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/ui/package.json apps/ui/tsconfig.json ./apps/ui/

RUN npm ci

COPY apps/ui/src ./apps/ui/src
COPY apps/ui/server.mjs ./apps/ui/server.mjs
COPY apps/ui/public ./apps/ui/public
RUN npm run build --workspace=@specify-poker/ui

EXPOSE 3000

CMD ["node", "apps/ui/server.mjs"]
