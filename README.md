# Sercan´s Lotterie

Eine deutschsprachige Lotterie für RP-Runden mit Losverwaltung, zufälliger Gewinnerziehung und Ziehungshistorie. Alle Beträge sind fiktive Spielwährung.

**Webseite:** [Sercan´s Lotterie](https://sercan1115.github.io/sercans-lotterie/)

## Verwendung

1. Lege in den Einstellungen Rundennamen, Lospreis, Startjackpot und Spielwährung fest.
2. Trage den RP-Namen und die gewünschte Losanzahl ein. Pro Eintrag sind 1 bis 100 Lose möglich, pro Runde höchstens 10.000.
3. Prüfe die Losliste und entferne bei Bedarf einzelne Lose. Der Jackpot besteht aus Startjackpot plus Losanzahl mal Lospreis.
4. Starte die Ziehung. Jedes Los hat dieselbe Gewinnchance; mehrere Lose erhöhen entsprechend die Chance des Spielers. Die Auswahl nutzt den sicheren Zufallsgenerator des Browsers ohne Modulo-Verzerrung.
5. Nach der Ziehung ist die Runde gesperrt. Eine neue Runde leert die Losliste und behält die Einstellungen sowie die letzten 100 Ziehungen.

## Mehrere Spieler und Ergebnisse teilen

Über die Sammelvergabe lassen sich bis zu 100 Spielerzeilen auf einmal eintragen. Schreibe je Zeile `RP-Name;Anzahl`; ein Name ohne Anzahl erhält ein Los. Die gesamte Liste wird geprüft, bevor Lose übernommen werden.

```text
Sercan Kaya;3
Mia Müller;2
Jonas Weber
```

Mit der Teilnehmersuche findest du Namen auch unabhängig von Großschreibung und Umlauten. Sortiere die Liste alphabetisch oder nach der Anzahl der Lose. Suche und Sortierung verändern weder die Lose noch die Gewinnchancen.

Der CSV-Export enthält alle Lose der aktuellen Runde mit Loswert, Spielwährung und Status, zum Beispiel für Excel. Er ergänzt die JSON-Sicherung; wiederherstellen kannst du eine Runde über JSON. Nach einer Ziehung kannst du die Gewinnerbekanntgabe für Discord oder euren RP-Chat kopieren. Erwähnungen in RP-Namen werden dabei entschärft.

Zur Ziehung gehören Countdown, Losanimation und Konfetti. Soundeffekte lassen sich auf Wunsch einschalten. Die Einstellung für reduzierte Bewegung des Browsers wird berücksichtigt.

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
- `dist/round-tools.mjs`: Sammelvergabe, Teilnehmersuche, CSV und Gewinnerbekanntgabe.
- `tests/*.test.mjs`: Tests der Ziehung, Rundensperre, Sicherungen und Zusatzfunktionen.
- `scripts/serve.mjs`: lokaler Vorschau-Webserver.

Sicherung und Quellcode enthalten keine Zugangsdaten. Es werden keine externen Bibliotheken oder Analyse-Dienste benötigt.
