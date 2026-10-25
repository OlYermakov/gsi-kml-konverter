import proj4 from "proj4";
import "./style.css";

const DB_REF_GK3 =
  "+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 " +
  "+ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs";

const CODE_NAMES = { 5: "Passpunkt", 41: "Achse" };
const CODE_COLORS = { 5: "ff000000", 41: "ffff00ff" };

const fileInput = document.querySelector("#file-input");
const button = document.querySelector("#convert-button");
const buttonLabel = button.querySelector("span");
const status = document.querySelector("#status");

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function parseWord(word) {
  const match = word.match(/^\*?(\d{2})(.{4})([+-])(.+)$/);
  if (!match) return null;

  return {
    index: match[1],
    info: match[2],
    sign: match[3] === "-" ? -1 : 1,
    data: match[4],
  };
}

function parseMeasurement(word) {
  const value = Number.parseInt(word.data, 10);
  if (!Number.isFinite(value)) {
    throw new Error("Die GSI-Datei enthält ungültige Koordinaten.");
  }

  const divisor = word.info.at(-1) === "6" ? 10000 : 1000;
  return word.sign * value / divisor;
}

function parseGsi(source) {
  const points = [];

  for (const sourceLine of source.split(/\r?\n/)) {
    if (!sourceLine.trim()) continue;

    const words = sourceLine.trim().split(/\s+/).map(parseWord).filter(Boolean);
    const byIndex = new Map(words.map((word) => [word.index, word]));
    const pointWord = byIndex.get("11");
    const eastWord = byIndex.get("81");
    const northWord = byIndex.get("82");
    if (!pointWord || !eastWord || !northWord) continue;

    const cleanedName = pointWord.data.replace(/^0+(?=[A-Za-z0-9])/, "").trim();
    const code = byIndex.get("71")?.data.replace(/^0+(?=\d)/, "").trim() || "0";
    const heightWord = byIndex.get("83");

    points.push({
      name: cleanedName || pointWord.data.trim(),
      code,
      east: parseMeasurement(eastWord),
      north: parseMeasurement(northWord),
      height: heightWord ? parseMeasurement(heightWord) : undefined,
    });
  }

  if (!points.length) {
    throw new Error("Keine GSI-Punkte mit den Koordinaten 81/82 gefunden.");
  }

  return points;
}

function transformPoint(point) {
  const [rawLongitude, rawLatitude] = proj4(DB_REF_GK3, "EPSG:4326", [point.east, point.north]);

  return [
    rawLongitude - 0.0000027527158362151927 + 0.000001185736433428924 * (rawLongitude - 8),
    rawLatitude + 0.00000140394613351746 + 0.00000074531149961187 * (rawLongitude - 8),
  ];
}

function placemark(point) {
  const [longitude, latitude] = transformPoint(point);
  const codeName = CODE_NAMES[point.code] ?? `Code ${point.code}`;
  const color = CODE_COLORS[point.code] ?? "ffffffff";
  const coordinates = point.height === undefined
    ? `${longitude.toFixed(8)},${latitude.toFixed(8)}`
    : `${longitude.toFixed(8)},${latitude.toFixed(8)},${point.height.toFixed(4)}`;

  return `      <Placemark id="${escapeXml(point.name)}">
        <name>${escapeXml(point.name)}</name>
        <Snippet>${escapeXml(point.code)} ${escapeXml(codeName)}</Snippet>
        <description>${escapeXml(point.code)} ${escapeXml(codeName)}</description>
        <visibility>1</visibility>
        <Style>
          <LabelStyle><color>${color}</color><scale>1.000</scale></LabelStyle>
        </Style>
        <Point>
          <extrude>0</extrude>
          <altitudeMode>${point.height === undefined ? "clampToGround" : "absolute"}</altitudeMode>
          <coordinates>${coordinates}</coordinates>
        </Point>
      </Placemark>`;
}

function createKml(points, documentName) {
  const groups = new Map();
  for (const point of points) {
    const group = groups.get(point.code) ?? [];
    group.push(point);
    groups.set(point.code, group);
  }

  const folders = [...groups.entries()].map(([code, group]) => `    <Folder>
      <name>${escapeXml(CODE_NAMES[code] ?? `Code ${code}`)} (${escapeXml(code)})</name>
      <visibility>1</visibility>
      <open>1</open>
${group.map(placemark).join("\n")}
    </Folder>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <description>Lokal aus Leica GSI konvertiert</description>
${folders}
  </Document>
</kml>
`;
}

function convertGsi(source, sourceName) {
  const points = parseGsi(source);
  const documentName = sourceName.replace(/\.gsi$/i, "") || "konvertiert";
  return {
    kml: createKml(points, documentName),
    fileName: `${documentName}.KML`,
    pointCount: points.length,
  };
}

function showIdle() {
  status.innerHTML = '<p class="privacy"><span aria-hidden="true">●</span>Die Datei wird nur auf Ihrem Gerät verarbeitet</p>';
}

function showSuccess(result) {
  status.innerHTML = `
    <div class="success">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"></path></svg>
      <div><strong>KML heruntergeladen</strong><span>${escapeXml(result.fileName)} · ${result.pointCount} Punkte</span></div>
    </div>`;
}

function showError(message) {
  status.innerHTML = `<p class="error" role="alert">${escapeXml(message)}</p>`;
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  button.disabled = true;
  buttonLabel.textContent = "Konvertierung…";
  showIdle();

  try {
    const result = convertGsi(await file.text(), file.name);
    const url = URL.createObjectURL(new Blob([result.kml], {
      type: "application/vnd.google-earth.kml+xml;charset=utf-8",
    }));
    const link = document.createElement("a");
    link.href = url;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showSuccess(result);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Die GSI-Datei konnte nicht gelesen werden.");
  } finally {
    button.disabled = false;
    buttonLabel.textContent = "GSI-Datei auswählen";
  }
}

button.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFile);

export { convertGsi, parseGsi, transformPoint };
