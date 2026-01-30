#!/bin/bash
set -e

PROJECT_ROOT="$(pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
echo "Building Angular frontend..."

cd "$FRONTEND_DIR"
pnpm install
pnpm run build --output-path=dist

echo "Angular build completed"

cd $PROJECT_ROOT
echo "Building Docker image..."
docker buildx build $@
