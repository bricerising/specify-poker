FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN npm ci

COPY apps/api/src ./apps/api/src
COPY packages/shared/src ./packages/shared/src
RUN npm run build --workspace=@specify-poker/api

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]
