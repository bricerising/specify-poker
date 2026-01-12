FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/event/package.json apps/event/tsconfig.json ./apps/event/

RUN npm ci

COPY apps/event/src ./apps/event/src
COPY apps/event/proto ./apps/event/proto

RUN npm run build --workspace=@specify-poker/event

EXPOSE 50054

CMD ["node", "apps/event/dist/server.js"]
