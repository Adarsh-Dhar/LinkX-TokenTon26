# Simple Node.js Dockerfile for demo nodes
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN apk add --no-cache python3 make g++ \
	&& npm install -g pnpm \
	&& pnpm install
COPY . .
CMD ["node", "node_microstructure.js"] # Default, overridden by docker-compose
