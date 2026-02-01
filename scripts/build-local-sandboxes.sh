#!/bin/bash

# Configuration
REGISTRY_BASE=${DOCKER_REGISTRY_BASE:-"ghcr.io/pragnya-works/edward"}
FRAMEWORKS=("nextjs" "vite-react" "vanilla")

echo "🚀 Building sandbox images locally for registry: $REGISTRY_BASE"

for framework in "${FRAMEWORKS[@]}"; do
  echo "📦 Building $framework..."
  
  # Check if Dockerfile exists in the template directory
  if [ -f "docker/templates/$framework/Dockerfile" ]; then
    docker build -t "$REGISTRY_BASE/$framework-sandbox:latest" "docker/templates/$framework"
    
    if [ $? -eq 0 ]; then
      echo "✅ Successfully built $framework-sandbox"
    else
      echo "❌ Failed to build $framework"
      exit 1
    fi
  else
    echo "⚠️ Warning: Dockerfile not found for $framework at docker/templates/$framework/Dockerfile"
  fi
done

echo "🎉 All local builds complete!"
echo "💡 Tip: Make sure to set DOCKER_REGISTRY_BASE in your apps/api/.env if you used a custom one."
