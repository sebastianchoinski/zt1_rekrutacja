# Zasady obliczeń

## Produkcja i magazyn

Element z recepturą jest produkowany, a element bez receptury jest kupowany. Ta reguła obejmuje również produkt z zamówienia.

Dla każdego elementu najpierw sumowane jest zapotrzebowanie ze wszystkich receptur, w których występuje. Następnie odejmowany jest jego stan magazynowy. Receptura rozwijana jest tylko dla ilości pozostałej do produkcji:

```text
netto = max(brutto − stan, 0)
```

Brutto oznacza zapotrzebowanie po uwzględnieniu zapasu rodziców i odpadu, ale przed odjęciem stanu bieżącego elementu. Brak wpisu w magazynie oznacza stan równy 0.

Magazyn jest częścią danych wejściowych. Kalkulacja nie rezerwuje ani nie zużywa zapasu. Historia przechowuje osobne kopie danych i wyników, bez wspólnej ewidencji magazynowej.

## Odpad, jednostki i opakowania

Ilość w pozycji BOM oznacza zużycie składnika na jedną jednostkę rodzica. Odpad jest narzutem naliczanym osobno na każdej zależności:

```text
zapotrzebowanie składnika = ilość do produkcji rodzica × zużycie jednostkowe × (1 + odpad / 100)
```

Nie ma przeliczeń między jednostkami. Kody i jednostki rozróżniają wielkość liter. Dokładny zapis `szt` oznacza jednostkę niepodzielną: zamówienie, stan i opakowanie muszą być całkowite. Zużycie w BOM może być ułamkowe; produkcja i zakup są zaokrąglane w górę po zsumowaniu potrzeb i odjęciu stanu.

`purchasePack` określa ilość materiału w jednym opakowaniu, w jednostce elementu z katalogu:

```text
liczba opakowań = ceil(netto / purchasePack)
zakup = liczba opakowań × purchasePack
nadwyżka = zakup − netto
```

Bez opakowania zakup jest równy netto, z zaokrągleniem w górę dla `szt`. Pola `purchasePack` i `packages` w wyniku mają wtedy wartość `null`. Opakowanie można określić tylko dla elementu kupowanego.

## Walidacja i liczby

Walidacja obejmuje cały zestaw danych, także receptury niezwiązane z zamówieniem oraz zamówienie zerowe.

- Wszystkie odwołania muszą wskazywać elementy istniejące w katalogu. Cykle w BOM są odrzucane; komunikat zawiera ścieżkę cyklu.
- Kody katalogu, wpisy magazynu i pary rodzic–składnik nie mogą się powtarzać. Nieznane pola JSON są odrzucane.
- Tekst nie może zawierać znaku NUL ani nieprawidłowych par surogatów Unicode, których nie obsługuje zapis w PostgreSQL. Poprawne znaki Unicode, w tym emoji, są dozwolone.
- Zamówienie i stan mogą wynosić 0. Zużycie w BOM i wielkość opakowania muszą być dodatnie. Odpad mieści się w zakresie 0–100%.
- Liczby muszą być skończone, nieujemne i nie większe niż `Number.MAX_SAFE_INTEGER`. Wynik poza obsługiwanym zakresem również jest błędem.
- Dokładne obliczenia mają limit 500 cyfr znaczących dla zapotrzebowania na składnik. Zwykłe ilości z kilkoma miejscami po przecinku mieszczą się w nim z dużym zapasem. Receptury z bardzo wieloma miejscami po przecinku na wielu poziomach są odrzucane błędem `CALCULATION_RANGE`, zamiast obciążać serwer.

Obliczenia korzystają z `big.js`: dodawanie, odejmowanie i mnożenie są dokładne dla dziesiętnego zapisu liczb wejściowych. Dzielenie służy wyłącznie do wyznaczenia całkowitej liczby opakowań i zaokrągla w górę. Odpad jest mnożony przez `0,01`, więc nie wymaga dzielenia. Decyzje o produkcji, wykorzystaniu magazynu i opakowaniach zapadają przed konwersją wyników do liczb JSON. Wejście i wynik używają liczb JSON. Tabele wyświetlają do 8 miejsc po przecinku, a CSV zachowuje wartości wyniku. Formularz przyjmuje kropkę i przecinek dziesiętny.

## Algorytm i wynik

Funkcja [calculateRequirements](../src/calculator/calculateRequirements.ts) działa niezależnie od bazy i interfejsu. Nie wykonuje I/O ani nie zmienia danych wejściowych.

1. Waliduje dane i buduje graf zależności.
2. Sortuje cały BOM topologicznie, wykrywając ewentualne cykle.
3. Przetwarza rodziców przed składnikami: sumuje potrzeby, odejmuje magazyn i rozwija recepturę brakującej ilości.
4. Dla elementów kupowanych oblicza zakup z uwzględnieniem opakowań.

Ta kolejność pozwala odjąć zapas wspólnego półproduktu tylko raz i zaokrąglić jego produkcję po zebraniu potrzeb wszystkich rodziców. Przejście grafu jest iteracyjne, więc głębokość BOM nie zwiększa stosu wywołań.

Wynik zawiera trzy pola opisane w [typach kalkulatora](../src/calculator/types.ts):

- `order` — zamówienie uzupełnione o jednostkę.
- `requirements` — materiały wymagające zakupu, posortowane po kodzie; brutto, stan, netto, opakowania, zakup i nadwyżka.
- `plan` — zapotrzebowanie, wykorzystanie magazynu i produkcja. Pole `sources` rozbija potrzeby na rodziców, ich ilości produkcyjne, zużycie jednostkowe i odpad.

## Przykład: szafki

Dane: [examples/cabinet.json](../examples/cabinet.json). Zamówienie obejmuje 10 szafek, bez zapasu gotowych wyrobów. Każda wymaga jednego korpusu; zapas 4 korpusów zmniejsza ich produkcję do 6 sztuk.

**Płyta.** Występuje bezpośrednio w szafce i w korpusie. Obie pozycje mają 10% odpadu:

```text
szafki:     10 × 0,5 m² × 1,10 = 5,5 m²
korpusy:     6 × 1,5 m² × 1,10 = 9,9 m²
brutto:      5,5 + 9,9 = 15,4 m²
netto:      15,4 − 3 = 12,4 m²
opakowania: ceil(12,4 / 5,8) = 3 arkusze
zakup:       3 × 5,8 = 17,4 m²
nadwyżka:   17,4 − 12,4 = 5 m²
```

**Obrzeże.** Potrzebne do 6 produkowanych korpusów, po 6 mb na korpus i z 5% odpadu: `6 × 6 × 1,05 = 37,8 mb`. Brak zapasu i opakowania oznacza zakup 37,8 mb.

**Zawiasy.** Każda szafka wymaga 2 sztuk: `10 × 2 = 20 szt`. Po odjęciu zapasu 5 sztuk do zakupu pozostaje 15 sztuk.
