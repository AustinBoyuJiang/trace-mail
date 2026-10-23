FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
RUN mkdir -p /app/server/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=4318
EXPOSE 4318
VOLUME ["/app/server/data"]
CMD ["node", "server/index.mjs"]
