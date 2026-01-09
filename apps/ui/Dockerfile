FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/ui/package.json apps/ui/tsconfig.json ./apps/ui/
COPY apps/ui/src ./apps/ui/src
COPY apps/ui/server.js ./apps/ui/server.js
COPY apps/ui/public ./apps/ui/public

RUN npm ci
RUN npm run build --workspace=@specify-poker/ui

EXPOSE 3000

CMD ["node", "apps/ui/server.js"]
