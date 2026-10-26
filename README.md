# Sercan´s Lotterie

Eine deutschsprachige Lotterie für RP-Runden mit Losverwaltung, zufälliger Gewinnerziehung und Ziehungshistorie. Alle Beträge sind fiktive Spielwährung.

**Webseite:** [Sercan´s Lotterie](https://sercan1115.github.io/sercans-lotterie/)

## Verwendung

1. Lege in den Einstellungen Rundennamen, Lospreis, Startjackpot und Spielwährung fest.
2. Trage den RP-Namen und die gewünschte Losanzahl ein. Pro Eintrag sind 1 bis 100 Lose möglich, pro Runde höchstens 10.000.
3. Prüfe die Losliste und entferne bei Bedarf einzelne Lose. Der Jackpot besteht aus Startjackpot plus Losanzahl mal Lospreis.
4. Starte die Ziehung. Jedes Los hat dieselbe Gewinnchance; mehrere Lose erhöhen entsprechend die Chance des Spielers. Die Auswahl nutzt den sicheren Zufallsgenerator des Browsers ohne Modulo-Verzerrung.
5. Nach der Ziehung ist die Runde gesperrt. Eine neue Runde leert die Losliste und behält die Einstellungen sowie die letzten 100 Ziehungen.

Die Daten werden ausschließlich im `localStorage` dieses Browsers gespeichert. Andere Geräte, Browser und Besucher besitzen eigene, voneinander unabhängige Runden. Es gibt keinen Server, keine Anmeldung und keine gemeinsame Datenbank. Browserdaten können gelöscht werden: Exportiere deshalb regelmäßig eine JSON-Sicherung; über den Import lässt sie sich wiederherstellen. Eine Sicherung enthält RP-Namen und Ziehungsergebnisse und sollte entsprechend aufbewahrt werden.

Die Seite verwaltet eine RP-Lotterie für den Veranstalter. Sie verarbeitet keine Zahlungen und führt keine Echtgeldtransaktionen aus. Die lokale Historie ist kein manipulationssicheres öffentliches Register.

## Lokal starten

Voraussetzung: Node.js 22 oder neuer. Es sind keine zusätzlichen Pakete erforderlich.

```sh
npm test
npm run dev
```

Öffne die beim Start angezeigte lokale Adresse. Der Webserver liefert den Inhalt von `dist/` aus. Mit `Strg+C` beendest du ihn.

## GitHub Pages

Die Seite ist statisches HTML, CSS und JavaScript im Verzeichnis `dist/`; ein Build ist nicht nötig. Der Workflow `.github/workflows/pages.yml` führt bei jedem Push auf `main` die Tests aus und veröffentlicht anschließend `dist/` auf GitHub Pages.

Unter **Settings → Pages → Build and deployment → Source** muss **GitHub Actions** ausgewählt sein. Der Workflow lässt sich außerdem unter **Actions → Deploy GitHub Pages → Run workflow** manuell starten.

## Dateien

- `dist/index.html`, `dist/styles.css`, `dist/app.mjs`: Oberfläche und Browserlogik.
- `dist/engine.mjs`: validierte Lotterie- und Sicherungslogik.
- `tests/engine.test.mjs`: Tests der Ziehung, Rundensperre, Limits und Sicherungen.
- `scripts/serve.mjs`: lokaler Vorschau-Webserver.

Sicherung und Quellcode enthalten keine Zugangsdaten. Es werden keine externen Bibliotheken oder Analyse-Dienste benötigt.
