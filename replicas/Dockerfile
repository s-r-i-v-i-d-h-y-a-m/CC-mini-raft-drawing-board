FROM node:18

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

ENV NODE_OPTIONS="--max-old-space-size=128"

CMD ["node", "replicaServer.js"]
