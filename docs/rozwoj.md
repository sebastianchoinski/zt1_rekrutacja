# Rozwój projektu

## Praca w Dockerze

Uruchomienie usług opisuje [README](../README.md#uruchomienie). Po zmianie zależności, konfiguracji lub schematu bazy wymagane jest ponowne `make dev-up`.

```sh
make test    # testy w kontenerze
make check   # generowanie klienta Prisma, sprawdzenie typów i kompilacja
```

Polecenia korzystają z obrazu API zbudowanego przez `make dev-up`. Compose udostępnia frontend na porcie `5175` i PostgreSQL na `5434`, wyłącznie na localhost. API jest dostępne przez proxy frontendu pod `/api`.

## Praca z lokalnym Node.js

Wymagania: Node.js co najmniej 22.12, npm oraz Docker z Compose do uruchomienia PostgreSQL.

```sh
docker compose up -d --wait db
cp .env.example .env
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

Frontend działa pod [http://localhost:5175](http://localhost:5175), a API pod [http://localhost:3002/api](http://localhost:3002/api).

### Konfiguracja

Plik [.env.example](../.env.example) zawiera `DATABASE_URL` dla lokalnej bazy oraz port API (`PORT`, domyślnie `3002`).

API nasłuchuje na `127.0.0.1`. Zmienna `HOST` zmienia adres nasłuchiwania; Compose ustawia `0.0.0.0`. Proxy Vite domyślnie kieruje żądania do `http://127.0.0.1:3002`; adres można zmienić przez `API_URL` w środowisku procesu Vite.

### Kompilacja i uruchomienie

```sh
npm run build
npm run db:migrate
npm start
```

Po kompilacji NestJS udostępnia API i zbudowany frontend pod [http://localhost:3002](http://localhost:3002). Migracje są wykonywane osobno, przed uruchomieniem serwera.

## Sprawdzanie kodu

```sh
npm test
npm run format:check
npm run build
```

`build` generuje klienta Prisma, sprawdza typy i kompiluje frontend oraz API. `npm run format` formatuje pliki projektu.

Testy obejmują obliczenia i walidację, kontrakt HTTP, edycję danych, historię, dostępność kontrolek oraz eksport CSV. Kalkulator jest sprawdzany m.in. dla wspólnych półproduktów na różnych poziomach, granic opakowań i BOM o głębokości 5000 poziomów.

Testy API zastępują Prisma obiektem testowym i nie wymagają bazy. Testy interfejsu działają w jsdom; nie sprawdzają rzeczywistego układu ani kontrastu. Zapis do PostgreSQL i wygląd interfejsu wymagają sprawdzenia w uruchomionej aplikacji.

## Struktura kodu

| Katalog          | Zawartość                                                                         |
| ---------------- | --------------------------------------------------------------------------------- |
| `src/calculator` | Walidacja, graf zależności, obliczenia i typy; bez zależności od Reacta i NestJS. |
| `src/api`        | Endpointy, zapis przez Prisma i obsługa błędów.                                   |
| `src/web`        | Formularz, prezentacja wyników, historia i style komponentów.                     |
| `prisma`         | Schemat bazy i wersjonowane migracje.                                             |
| `examples`       | Przykładowy zestaw danych.                                                        |
| `tests`          | Testy kalkulatora, API i interfejsu.                                              |
