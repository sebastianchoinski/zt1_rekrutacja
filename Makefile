.PHONY: dev-up dev-down logs test check

dev-up:
	docker compose up --build -d --wait
	@echo "Kalkulator: http://localhost:5175"

dev-down:
	docker compose down

logs:
	docker compose logs -f api web

test:
	docker compose run --rm --no-deps api npm test

check:
	docker compose run --rm --no-deps api npm run build
