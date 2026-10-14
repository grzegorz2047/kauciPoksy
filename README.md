# KaucjaPoksy

Nieoficjalny, niekomercyjny projekt fanowski do nauki programowania. Skanowanie kodów EAN napojów pozwala budować kolekcję 151 Pokémonów pierwszej generacji.

## Struktura projektu

```text
/
├── index.html           # Struktura strony i elementy interfejsu
├── styles.css           # Wygląd i układ responsywny
├── README.md            # Dokumentacja projektu
└── js/
    ├── app.js           # Logika aplikacji, skaner, API i zapis
    └── pokemon-data.js  # Katalog Pokémonów
```

## Jak działa aplikacja?

- **HTML — `index.html`:** opisuje pola formularzy, przyciski, kolekcję i okno szczegółów.
- **CSS — `styles.css`:** określa kolory, odstępy, układ kart i zachowanie na mniejszych ekranach.
- **Dane — `js/pokemon-data.js`:** eksportuje tablicę `CREATURES` z opisami postaci.
- **Logika — `js/app.js`:** obsługuje skanowanie, walidację EAN, pobieranie opisów, XP i renderowanie.
- **Pamięć — `LocalCollectionStore`:** przechowuje kolekcję w `localStorage` danej przeglądarki.

## Najważniejsze funkcje

| Funkcja | Odpowiedzialność |
| --- | --- |
| `render()` | Aktualizuje liczniki i wyświetla kafelki kolekcji. |
| `collect(rawEAN)` | Koordynuje skan: walidację, weryfikację napoju, aktualizację kolekcji i zapis. |
| `lookupEligibleBeverage(ean)` | Sprawdza produkt w zewnętrznym katalogu. |
| `loadListDescription(creature)` | Pobiera opis do karty Pokémona. |
| `showPokedexDetails(creature)` | Pokazuje szczegóły wybranej postaci. |
| `startCamera()` / `stopCamera()` | Uruchamiają i zatrzymują skaner. |

## Uruchomienie lokalne

Projekt korzysta z modułów JavaScript, kamery i zewnętrznych API. Uruchom lokalny serwer HTTP w katalogu projektu:

```bash
python -m http.server 8000
```

Następnie otwórz [http://localhost:8000](http://localhost:8000). Dostęp do kamery wymaga zwykle HTTPS albo adresu `localhost`.

## Proponowana ścieżka nauki

1. Zmień nagłówek w `index.html` i kolory w `styles.css`.
2. Otwórz `js/pokemon-data.js` i przeanalizuj pola jednego obiektu.
3. Dodaj tymczasowy `console.log(rawEAN)` w `collect()`, aby prześledzić przepływ danych.
4. Przeczytaj `render()` i sprawdź, jak stan aplikacji jest zamieniany na elementy HTML.
5. Dopiero później modyfikuj skaner i integracje zewnętrzne.

## Ograniczenia

- Przypisanie kodu EAN do Pokémona jest demonstracyjne i nie rozpoznaje rzeczywistego produktu.
- Katalog produktów i PokéAPI są usługami zewnętrznymi; ich awarie mogą ograniczyć funkcje aplikacji.
- Kolekcja jest przechowywana lokalnie i nie synchronizuje się między urządzeniami.
- Projekt jest fanowski, nie jest powiązany z właścicielami marki Pokémon i nie potwierdza zwrotu opakowania ani wypłaty kaucji.
