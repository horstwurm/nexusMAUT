# Beispieldaten für den Upload

250 fiktive Kundinnen und Kunden mit 764 Positionen und 6'721 Transaktionen in drei
Quellformaten – überall mit demselben Inhalt. Erzeugt mit `npm run samples:upload`
(`scripts/upload-samples.mts`, immer dieselben Daten; Datumswerte relativ zum Erstellungstag).

| Format | Datei(en) |
|---|---|
| CSV | `csv/typen.csv`, `csv/kunden.csv`, `csv/positionen.csv`, `csv/transaktionen.csv` |
| Excel | `nexusMAUT-upload.xlsx` mit den Blättern Typen, Kunden, Positionen, Transaktionen |
| JSON | `nexusMAUT-upload.json` |

## Verweise

```
Kunde (kundennummer K100001)
  └─ Position (positionsnummer P000001, kundennummer → Kunde, typ → Typen)
       └─ Transaktion (transaktionsnummer T0000001, positionsnummer → Position, kundennummer)
```

## Inhalt

- **Typen** – die sieben Produkt- und Dienstleistungstypen (`konto`, `sparkonto`, `kreditkarte`,
  `depot`, `hypothek`, `versicherung`, `beratung`) mit ihren Attributen pro Ebene (Position /
  Transaktion): Name, Attributtyp (`alpha`, `num`, `date`, `bool`, `list`) und die Optionen einer
  Auswahlliste (`|`-getrennt).
- **Kunden** – `kundennummer`, `vorname`, `nachname`, `geburtsdatum`, `anrede` (Frau / Herr).
- **Positionen** – `positionsnummer`, `kundennummer`, `typ`, `produkt`, danach eine Spalte pro
  Attributname; gefüllt sind nur die Attribute des jeweiligen Typs.
- **Transaktionen** – `transaktionsnummer`, `positionsnummer`, `kundennummer`, `typ`, danach eine
  Spalte pro Attributname; pro Position nach Datum sortiert.

In JSON stehen die Attributwerte einer Position oder Transaktion unter `werte`.

## Schreibweise der Werte

| | CSV | Excel | JSON |
|---|---|---|---|
| Trennzeichen | `;`, UTF-8 mit BOM | – | – |
| Datum | `2026-11-24` | Datumszelle | `"2026-11-24"` |
| Zahl | `1234.5` (Dezimalpunkt) | Zahl | `1234.5` |
| Ja/Nein | `ja` / `nein` | `TRUE` / `FALSE` | `true` / `false` |
| leer | leeres Feld | leere Zelle | Schlüssel fehlt |

Alle Daten sind erfunden; Namen, IBAN und Nummern gehören zu niemandem.
