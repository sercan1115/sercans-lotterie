# Sercan´s Lotterie

Öffentliche RP-Lotterie: https://sercan1115.github.io/sercans-lotterie/

Veranstalterbereich: https://sercans-lotterie-service.ochre-shore-2706.chatgpt.site/admin

## Neuer Ablauf

1. Sercan legt im geschützten Veranstalterbereich die Runde, den Lospreis, Startjackpot und Bekanntgabetermin fest.
2. Nach Erhalt und Bestätigung der fiktiven RP-Währung stellt Sercan einen persönlichen Einmalcode für den RP-Namen und die bezahlte Losanzahl aus.
3. Der Spieler gibt diesen RP-Namen und den Code auf der Startseite ein. Die Lose werden einmalig in der gemeinsamen Datenbank gespeichert; die Seite zeigt eine Teilnahmebestätigung.
4. Die Startseite zeigt allen Besuchern dieselbe Runde und einen Countdown auf Basis der Serverzeit. Die erste Serveranfrage ab dem Termin speichert genau einen Gewinner; geöffnete Seiten aktualisieren sich automatisch.
5. Nach Abschluss kann Sercan die nächste Runde anlegen. Ungenutzte Codes gelten nur für ihre ursprüngliche Runde und werden nicht übertragen.

Der erste Termin wird vom Veranstalter später festgelegt. Bis dahin wird kein fiktiver Countdown angezeigt. Ausgestellte Codes reservieren Loskapazität; nur eingelöste Lose nehmen an der Ziehung teil und erhöhen den angezeigten Jackpot.

## Verwaltung und Daten

Die Verwaltungsoberfläche nutzt die ChatGPT-Anmeldung und eine serverseitige Freigabe des Eigentümerkontos. Die öffentliche Webseite kann keine Codes erstellen. Vollständige Codes werden nur einmal nach der Ausstellung angezeigt, und der Server speichert nur deren Hash. Ein Code ist namensgebunden und kann einmal eingelöst werden. Ein identischer Netzwerk-Retry liefert denselben Beleg statt zusätzlicher Lose.

GitHub Pages liefert nur die öffentliche Oberfläche. Der separate Sites-Dienst mit D1 übernimmt die gemeinsamen Runden, Codes, Fristen und Gewinner. Keine Zugangsdaten gehören in diesen öffentlichen Quellcode. Die Backend-Quelle liegt im Workspace neben diesem Projekt unter sercans-lotterie-service und im zugehörigen Sites-Quellrepository.

Vorherige browserlokale Runden bleiben unter ihrem bisherigen Speicherschlüssel erhalten. Sie werden nicht automatisch als bezahlte Teilnahmen in die gemeinsame Datenbank übernommen. Im Browser werden jetzt ausschließlich Effektpräferenzen und Kopien eigener Teilnahmebestätigungen gespeichert; die gültigen Lose werden vom Server geführt.

Alle Beträge sind fiktive RP-Währung. Die Webseite verarbeitet keine Zahlungen.

## Entwicklung und Veröffentlichung

Node.js 22 oder neuer, keine zusätzlichen Frontend-Abhängigkeiten. Mit npm test werden die bisherigen Lotterie-Helfer geprüft. npm run dev startet die statische Vorschau. Die gemeinsame API erlaubt im Produktivbetrieb ausschließlich die GitHub-Pages-Origin; für vollständige lokale Integration ist ein Testbackend erforderlich.

Der GitHub-Actions-Workflow testet und veröffentlicht bei jedem Push auf main das Verzeichnis dist. Sites-Backend und GitHub-Pages-Frontend werden unabhängig veröffentlicht.

Wichtige Dateien: dist/public-app.mjs (öffentliche Oberfläche), dist/service-config.mjs (öffentliche Backend-URL ohne Schlüssel), dist/public.css (Layout), dist/effects.mjs und dist/effects.css (schaltbare Effekte). Ältere lokale Helfer bleiben für bestehende Sicherungen und Tests erhalten.
