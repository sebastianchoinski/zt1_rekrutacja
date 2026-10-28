# API

W środowisku deweloperskim API jest dostępne przez frontend pod `http://localhost:5175/api`. Przy uruchomieniu z lokalnym Node.js można korzystać także bezpośrednio z `http://localhost:3002/api`.

## Endpointy

| Metoda | Adres                   | Odpowiedź                                                       |
| ------ | ----------------------- | --------------------------------------------------------------- |
| POST   | `/api/calculations`     | `201` — obliczenie oraz zapis danych wejściowych i wyniku.      |
| GET    | `/api/calculations`     | `200` — podsumowania ostatnich 20 kalkulacji, od najnowszej.    |
| GET    | `/api/calculations/:id` | `200` — pełna zapisana kalkulacja; identyfikator musi być UUID. |
| GET    | `/api/health`           | `200` — `{ "status": "ok" }` po sprawdzeniu połączenia z bazą.  |

Starsze kalkulacje pozostają w bazie i są dostępne przez identyfikator.

## Dane wejściowe

Żądanie `POST /api/calculations` przyjmuje obiekt JSON z czterema wymaganymi polami:

| Pole    | Zawartość                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| `order` | Zamówienie: `item` — kod produktu, `quantity` — ilość.                                                           |
| `items` | Katalog elementów: `code`, `unit` i opcjonalne `purchasePack` — ilość materiału w opakowaniu.                    |
| `bom`   | Pozycje receptur: `parent`, `component`, `quantity` — zużycie na jednostkę rodzica, `wastePct` — procent odpadu. |
| `stock` | Stany magazynowe: `item` i `quantity`.                                                                           |

`items`, `bom` i `stock` są tablicami. Katalog musi zawierać co najmniej jeden element; receptury i magazyn mogą być puste. Reguły walidacji opisuje [dokumentacja obliczeń](obliczenia.md#walidacja-i-liczby).

Przykładowe wywołanie z katalogu głównego projektu:

```sh
curl http://localhost:5175/api/calculations \
  -H 'Content-Type: application/json' \
  --data-binary @examples/cabinet.json
```

## Odpowiedź

Zapisana kalkulacja zawiera metadane (`id`, `createdAt`, `orderItem`, `orderQuantity`, `materialCount`), dane wejściowe `input` i wynik `result`. Pole `materialCount` oznacza liczbę pozycji wymagających zakupu. Lista historii zwraca same metadane.

Pola wyniku opisuje [dokumentacja obliczeń](obliczenia.md#algorytm-i-wynik), a pełne typy odpowiedzi — [src/calculator/types.ts](../src/calculator/types.ts).

## Błędy

Odpowiedź błędu ma postać `{ code, message, issues: [{ path, message }] }`. `issues` zawiera błędy konkretnych pól lub pustą tablicę.

| Status | Przyczyna                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------ |
| 400    | Błędna składnia JSON (`INVALID_JSON`) lub niepoprawny UUID (`REQUEST_ERROR`).                    |
| 404    | Brak kalkulacji lub endpointu (`REQUEST_ERROR`).                                                 |
| 413    | Przekroczenie limitu danych wejściowych 1 MB (`INPUT_TOO_LARGE`).                                |
| 422    | Błędne dane (`INVALID_INPUT`), cykl (`BOM_CYCLE`) lub wynik poza zakresem (`CALCULATION_RANGE`). |
| 500    | Błąd serwera (`SERVER_ERROR`); szczegóły trafiają do logów.                                      |

Funkcja `calculateRequirements` użyta bez API rzuca `CalculationError` z polami `code`, `message` i `issues`.
