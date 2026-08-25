FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
COPY tsconfig.json ./
COPY lib ./lib
COPY worker ./worker
RUN pnpm prisma:generate && pnpm worker:build && pnpm prune --prod

FROM node:22-bookworm-slim AS runtime

ARG TARGETARCH
ARG TERRAFORM_VERSION=1.15.7
ARG SEMANTIC_TERRAFORM_AGENT_VERSION=1.2.0
ARG SEMANTIC_TERRAFORM_AGENT_SOURCE

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git python3 python3-pip python3-venv unzip \
  && case "$TARGETARCH" in amd64) terraform_arch=amd64 ;; arm64) terraform_arch=arm64 ;; *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; esac \
  && curl --fail --show-error --silent --location "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${terraform_arch}.zip" --output "/tmp/terraform_${TERRAFORM_VERSION}_linux_${terraform_arch}.zip" \
  && curl --fail --show-error --silent --location "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_SHA256SUMS" --output /tmp/terraform_SHA256SUMS \
  && cd /tmp \
  && grep "terraform_${TERRAFORM_VERSION}_linux_${terraform_arch}.zip" terraform_SHA256SUMS | sha256sum --check - \
  && cd / \
  && unzip "/tmp/terraform_${TERRAFORM_VERSION}_linux_${terraform_arch}.zip" -d /usr/local/bin \
  && python3 -m venv /opt/semantic-terraform-agent \
  && test -n "$SEMANTIC_TERRAFORM_AGENT_SOURCE" \
  && /opt/semantic-terraform-agent/bin/pip install --no-cache-dir "$SEMANTIC_TERRAFORM_AGENT_SOURCE" \
  && installed_agent_version=$(/opt/semantic-terraform-agent/bin/python -c "import importlib.metadata; print(importlib.metadata.version('semantic-terraform-agent'))") \
  && test "$installed_agent_version" = "$SEMANTIC_TERRAFORM_AGENT_VERSION" \
  && terraform version -json \
  && rm -rf /var/lib/apt/lists/* "/tmp/terraform_${TERRAFORM_VERSION}_linux_${terraform_arch}.zip" /tmp/terraform_SHA256SUMS

ENV NODE_ENV=production \
  SEMANTIC_TERRAFORM_AGENT_VERSION=${SEMANTIC_TERRAFORM_AGENT_VERSION} \
  PATH="/opt/semantic-terraform-agent/bin:${PATH}"
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "dist/worker/index.mjs", "--healthcheck"]
CMD ["node", "dist/worker/index.mjs"]
