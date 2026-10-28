# Materiał

Aplikacja do obliczania zapotrzebowania materiałowego na podstawie zamówienia, wielopoziomowych receptur (BOM) i stanów magazynowych. Wyznacza ilości do produkcji oraz listę zakupów, uwzględniając zapas wyrobów i półproduktów, odpad oraz wielkość opakowań.

Receptury, katalog elementów i magazyn można edytować w formularzu lub wprowadzić w formacie JSON. Wynik zawiera szczegóły obliczeń i eksport do CSV. Zapisane kalkulacje są dostępne w historii.

Historia ma adres `/historia`. Każda kalkulacja otwiera się pod własnym linkiem `/historia/{slug}`, który można skopiować, otworzyć w nowej karcie lub odświeżyć. Slug składa się z kodu zamawianego elementu i jego unikalnego identyfikatora; działa również dla wcześniej zapisanych kalkulacji.

Technologie: Docker, TypeScript, React, NestJS, PostgreSQL, Prisma, SCSS Modules.

## Uruchomienie

Wymagania: Docker z Compose oraz Make.

```sh
make dev-up
```

Aplikacja: [http://localhost:5175](http://localhost:5175).

Polecenie buduje obrazy, uruchamia bazę i wykonuje migracje. Nie wymaga lokalnego Node.js ani pliku `.env`. Zmiany w `src` są przeładowywane automatycznie.

```sh
make logs       # logi API i frontendu
make dev-down   # zatrzymanie usług z zachowaniem historii w bazie
```

Uruchomienie z lokalnym Node.js i polecenia do sprawdzania kodu opisuje [dokumentacja rozwoju](docs/rozwoj.md).

## Przykład

Formularz startuje z danymi z [examples/cabinet.json](examples/cabinet.json): zamówieniem na 10 szafek i zapasem 4 korpusów. Do produkcji pozostaje 10 szafek i 6 korpusów.

| Materiał | Jednostka | Brutto | Netto | Do zakupu |
| -------- | --------- | -----: | ----: | --------: |
| OBRZEZE  | mb        |   37,8 |  37,8 |      37,8 |
| PLYTA    | m²        |   15,4 |  12,4 |      17,4 |
| ZAWIAS   | szt       |     20 |    15 |        15 |

Płyta jest kupowana w arkuszach po 5,8 m², stąd zakup 3 arkuszy mimo zapotrzebowania netto 12,4 m². [Rozpisanie obliczeń](docs/obliczenia.md#przykład-szafki) wyjaśnia zużycie i odpad dla każdego materiału.

## Dokumentacja

- [Zasady obliczeń](docs/obliczenia.md) — magazyn, odpad, opakowania, walidacja i algorytm.
- [API](docs/api.md) — format danych, endpointy i odpowiedzi błędów.
- [Rozwój projektu](docs/rozwoj.md) — konfiguracja, testy i struktura kodu.
