# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
WORKDIR /app
COPY shared-ai/package.json shared-ai/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev && mkdir -p /data && chown node:node /data
COPY src/lib ./src/lib
COPY shared-ai/src ./shared-ai/src
RUN chmod -R a+rX /app
USER node
ENV PORT=8787
ENV SHARED_AI_DATABASE=/data/shared-ai.sqlite
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "shared-ai/src/server.ts"]
