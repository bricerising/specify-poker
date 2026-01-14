FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/notify/package.json apps/notify/tsconfig.json ./apps/notify/
# If shared packages are needed, they should be copied here

RUN npm ci

COPY apps/notify/src ./apps/notify/src
COPY apps/notify/proto ./apps/notify/proto

RUN npm run build --workspace=@specify-poker/notify

EXPOSE 50055

CMD ["node", "apps/notify/dist/server.js"]
