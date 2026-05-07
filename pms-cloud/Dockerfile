FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY src/ ./src/
COPY migrations/ ./migrations/

ENV NODE_ENV=production
ENV PORT=3000
ENV PMS_DATA_DIR=/data

EXPOSE 3000

CMD ["node", "src/index.js"]
