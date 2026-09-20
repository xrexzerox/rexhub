FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json manifest.json server.js ./
COPY lib ./lib
COPY providers ./providers
# v1.5: vendored undici (no build step, no registry access needed) - only
# used when PROXY_URL egress is configured
COPY node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server.js"]
