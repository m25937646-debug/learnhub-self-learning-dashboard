FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install --global pnpm@10.4.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
