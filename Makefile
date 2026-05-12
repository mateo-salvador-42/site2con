.PHONY: setup install build start dev db-setup db-migrate db-push clean docker-up docker-down docker-logs

DC ?= docker compose

# ── Installation système (Fedora/dnf) ─────────────────────────────────────────

setup:
	@echo "→ Installation des dépendances système..."
	@if command -v dnf >/dev/null 2>&1; then \
		sudo dnf install -y nodejs npm postgresql postgresql-server postgresql-contrib; \
	elif command -v apt-get >/dev/null 2>&1; then \
		sudo apt-get update && sudo apt-get install -y nodejs npm postgresql postgresql-contrib; \
	else \
		echo "Gestionnaire de paquets non reconnu (ni dnf ni apt). Installe Node.js et PostgreSQL manuellement."; \
		exit 1; \
	fi
	@echo "→ Initialisation de PostgreSQL..."
	@if command -v postgresql-setup >/dev/null 2>&1; then \
		sudo postgresql-setup --initdb 2>/dev/null || true; \
	elif command -v pg_createcluster >/dev/null 2>&1; then \
		sudo pg_createcluster main --start 2>/dev/null || true; \
	fi
	@sudo systemctl enable --now postgresql
	@echo "→ Création de la base de données..."
	@sudo -u postgres psql -c "CREATE USER site2con WITH PASSWORD 'site2con';" 2>/dev/null || true
	@sudo -u postgres psql -c "CREATE DATABASE site2con OWNER site2con;" 2>/dev/null || true
	@echo "→ Installation des dépendances npm..."
	@$(MAKE) install
	@echo ""
	@echo "✓ Setup terminé. Lance 'make dev' pour démarrer."

# ── Dépendances npm ────────────────────────────────────────────────────────────

install:
	npm ci
	npm run db:generate

# ── Build & lancement ──────────────────────────────────────────────────────────

build: install
	npm run db:push
	npm run build

start: build
	npm run start

dev: install
	npm run db:push
	npm run dev

# ── Base de données ────────────────────────────────────────────────────────────

db-setup:
	@echo "→ Création de la base de données..."
	@sudo -u postgres psql -c "CREATE USER site2con WITH PASSWORD 'site2con';" 2>/dev/null || true
	@sudo -u postgres psql -c "CREATE DATABASE site2con OWNER site2con;" 2>/dev/null || true
	@echo "→ Base de données prête."

db-migrate:
	npm run db:migrate

db-push:
	npm run db:push

# ── Docker ────────────────────────────────────────────────────────────────────
# docker-db  : lance uniquement PostgreSQL (pour faire tourner l'app en local)
# docker-up  : lance tout (app + db) dans des conteneurs
# docker-down: arrête et supprime les conteneurs

docker-db:
	$(DC) up -d db
	@echo "✓ PostgreSQL prêt sur localhost:5432 — lance 'make dev' pour démarrer l'app"

docker-up:
	$(DC) up --build -d
	@echo "✓ Lancé sur http://localhost:$${PORT:-3000}"

docker-down:
	$(DC) down

docker-logs:
	$(DC) logs -f app

# ── Nettoyage ──────────────────────────────────────────────────────────────────

clean:
	rm -rf node_modules .next
