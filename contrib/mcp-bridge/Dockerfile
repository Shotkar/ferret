# Ferret's MCP server over stdio, for Docker's MCP Toolkit and other clients that start a local process: forwards to
# your Ferret's /mcp. Settings: FERRET_URL (your Ferret's address) and FERRET_API_KEY (Settings → Claude & API).
FROM node:26-alpine
WORKDIR /app
COPY bridge.mjs .
USER node
ENTRYPOINT ["node", "/app/bridge.mjs"]
