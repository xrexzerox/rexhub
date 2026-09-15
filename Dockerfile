FROM node:20-slim
WORKDIR /app
COPY package.json manifest.json server.js ./
COPY lib ./lib
COPY providers ./providers
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "server.js"]
