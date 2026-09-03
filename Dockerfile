FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV FLOWPILOT_HOST=0.0.0.0
ENV FLOWPILOT_PORT=4317
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 4317
VOLUME ["/app/data"]
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
