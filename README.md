# GSI → KML

Ein schneller lokaler Web-Konverter für Leica-GSI-Dateien.

- Transformation ausschließlich von **DB-REF-GK3** nach WGS84/KML
- Verarbeitung vollständig im Browser; Dateien werden nicht hochgeladen
- Automatischer Download der erzeugten KML-Datei
- Für die Installation auf dem Startbildschirm vorbereitet

## Entwicklung

```bash
npm install
npm run dev
```

## Veröffentlichung

Jeder Push auf `main` wird automatisch mit GitHub Actions gebaut und auf GitHub Pages veröffentlicht.

Produktionsadresse: <https://olyermakov.github.io/gsi-kml-konverter/>
