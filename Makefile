.DEFAULT_GOAL := help

# =============================
# Bootstrap
# =============================
bootstrap: ## Setup dev environment (Node + Python)
	@echo ">> Bootstrapping workspace..."
	@pnpm install --frozen-lockfile || npm install
	@uv sync || poetry install || pip install -r requirements.txt || true

# =============================
# Docker Orchestration
# =============================
COMPOSE=docker compose -f docker-compose.yml -f docker-compose.override.yml

up: ## Run all services (Compose + override)
	$(COMPOSE) up -d --build

down: ## Stop all services (Compose + override)
	$(COMPOSE) down

dev: ## Run dev services (Compose + override, dev profile)
	$(COMPOSE) --profile dev up --build

logs: ## Tail logs (Compose + override)
	$(COMPOSE) logs -f --tail=100

# =============================
# Testing & Linting
# =============================
test: ## Run all tests (Node + Python)
	@echo ">> Running Node tests..."
	@pnpm test || npm test || true
	@echo ">> Running Python tests..."
	@pytest || python -m unittest || true

lint: ## Run linters (Node + Python)
	@echo ">> Linting Node..."
	@pnpm lint || npm run lint || true
	@echo ">> Linting Python..."
	@ruff check . || flake8 . || true

# =============================
# Docker (Compose) Test Targets
# =============================
compose-node-test: ## Run Node tests inside dev container (pnpm/npm)
	@docker compose -f docker-compose.yml run --rm dev sh -lc "chmod +x ./scripts/node-test.sh || true; ./scripts/node-test.sh"

compose-python-test: ## Run Python tests inside python container (pytest)
	@docker compose -f docker-compose.yml run --rm python sh -lc "chmod +x ./scripts/python-test.sh || true; ./scripts/python-test.sh"

compose-test: ## Run all tests via Docker Compose (Node + Python)
	@$(MAKE) compose-node-test || true
	@$(MAKE) compose-python-test || true

# =============================
# Docs
# =============================
docs: ## Generate docs (placeholder)
	@echo ">> Building docs..."
	@mkdocs build || echo "Docs not configured yet."

# =============================
# Help
# =============================
help: ## Show this help
	@echo Available targets:
	@findstr /R "^[a-zA-Z_-]*:.*##" $(MAKEFILE_LIST)



# =============================
# Docker (Compose) Lint Targets
# =============================
compose-node-lint: ## Run Node lint inside dev container
	@docker compose -f docker-compose.yml run --rm dev sh -lc "chmod +x ./scripts/node-lint.sh || true; ./scripts/node-lint.sh"

compose-python-lint: ## Run Python lint (ruff) inside python container
	@docker compose -f docker-compose.yml run --rm python sh -lc "chmod +x ./scripts/python-lint.sh || true; ./scripts/python-lint.sh ."

compose-lint: ## Run all linters via Docker Compose (Node + Python)
	@ compose-node-lint || true
	@ compose-python-lint || true
