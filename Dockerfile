FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production || npm install --omit=dev
COPY src ./src
COPY python_tools ./python_tools
CMD ["node", "src/index.js"]

