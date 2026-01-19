# ----------------------------
# Stage 1: Build backend
# ----------------------------
FROM node:22-alpine AS backend-build

# Install pnpm via corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app/backend

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/ ./
RUN pnpm exec tsc
RUN pnpm prune --prod

# ----------------------------
# Stage 2: Final image
# ----------------------------
FROM node:22-slim

WORKDIR /app
EXPOSE 8080

# Copy backend build
COPY --from=backend-build /app/backend/dist ./
COPY --from=backend-build /app/backend/node_modules ./node_modules

# Copy static frontend
COPY ./frontend/dist/browser ./static

# Copy config
COPY ./backend/src/config/application.default.yaml /app/application.default.yaml

# Default command
CMD ["node", "index.js"]
