#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
echo "Building Angular frontend..."

cd "$FRONTEND_DIR"
pnpm install
pnpm run build --output-path=dist

echo "Angular build completed"

cd $PROJECT_ROOT
echo "Building multi-arch Docker image..."
docker buildx build $@
