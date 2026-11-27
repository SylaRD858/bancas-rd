FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production DATA_DIR=/data TRUST_PROXY=1 PORT=8080
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "server/server.js"]
