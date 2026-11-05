# For Glama's MCP directory check (see README.md): the published Ferret image, with a throwaway account and key made
# at start, wrapped by mcp-proxy. Not for running Ferret — use the main image and compose.yaml for that.
FROM ghcr.io/ferret-project/ferret:latest
USER root
RUN npm install -g mcp-proxy@6 && npm cache clean --force
COPY contrib/glama/start.mjs /app/glama/start.mjs
USER node
# Throwaway values: this container holds nothing but an empty household.
ENV PUBLIC_URL=http://localhost:8787 \
    AUTH_SECRET=glama-check-only-not-a-secret-0123456789abcdef \
    FILES_KEY=CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk= \
    DATA_DIR=/tmp/ferret
HEALTHCHECK NONE
CMD ["mcp-proxy", "node", "/app/glama/start.mjs"]
