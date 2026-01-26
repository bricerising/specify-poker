FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/ui/package.json apps/ui/tsconfig.json ./apps/ui/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/

# Install only production deps for the UI + shared (avoid pulling Playwright into the image build).
RUN npm ci --omit=dev -w @specify-poker/shared -w @specify-poker/ui

# Add only the minimal build-time tooling needed for `tsc` in this image.
RUN mkdir -p /app/build-deps \
  && cd /app/build-deps \
  && npm init -y \
  && npm install --no-package-lock typescript@5.9.3 @types/react@18.3.27 @types/react-dom@18.3.7 \
  && cp -R node_modules/* /app/node_modules/ \
  && rm -rf /app/build-deps

COPY packages/shared/src ./packages/shared/src
COPY apps/ui/src ./apps/ui/src
COPY apps/ui/public ./apps/ui/public
COPY apps/ui/server.mjs ./apps/ui/server.mjs

RUN cd packages/shared \
  && node ../../node_modules/typescript/bin/tsc -p tsconfig.json \
  && node ../../node_modules/typescript/bin/tsc -p tsconfig.cjs.json \
  && node -e "const fs=require('node:fs'); fs.mkdirSync('dist/cjs',{recursive:true}); fs.writeFileSync('dist/cjs/package.json', JSON.stringify({type:'commonjs'}, null, 2));" \
  && cd /app \
  && node node_modules/typescript/bin/tsc -p apps/ui/tsconfig.json

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/ui/dist ./apps/ui/dist
COPY --from=builder /app/apps/ui/public ./apps/ui/public
COPY --from=builder /app/apps/ui/server.mjs ./apps/ui/server.mjs
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3000

CMD ["node", "apps/ui/server.mjs"]
