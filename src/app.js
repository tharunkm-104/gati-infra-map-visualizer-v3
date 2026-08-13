const format = new Intl.NumberFormat("en-IN");
const HOVER_DELAY_MS = 550;

// ---- GATI palette tokens ----
// Health scale: NABH recedes into the basemap grey, colleges pop.
// Language/skilling scale: warm orange + gold steps, entirely separate from health hues.
// Guidebook primaries: teal #006B76, deep teal #00333A, yellow #E5A812,
// light gold #FFCC4E, sky #84D2E2, brown #573D00, greys #839097 / #D8E2E7.
// Series colours below are spaced for contrast: health sits on the teal->cyan
// axis, language on the yellow->brown axis, and no two adjacent series share a
// lightness step. `ink: true` marks fills too light for white label text.
const GATI = {
  teal: "#006B76",
  tealDeep: "#00333A",
  tealDark: "#00333A",
  sky: "#84D2E2",
  cyan: "#2E9BAF",
  yellow: "#E5A812",
  goldLight: "#FFCC4E",
  brown: "#573D00",
  rust: "#B04A00",
  olive: "#7D8C3F",
  grey: "#839097",
  greyLight: "#D8E2E7",
  ink: "#101A18",
};

// Health series -- deep teal / mid cyan / grey. NABH stays recessive because it
// outnumbers the colleges by an order of magnitude.
const C_NABH = GATI.grey;
const C_NMC = GATI.tealDeep;
const C_INC = GATI.cyan;
// Language series -- yellow through brown, each a clear step apart.
const C_GOETHE = GATI.yellow;
const C_EXAM = GATI.goldLight;
const C_HEI = GATI.rust;
const C_PDOT = GATI.brown;
const C_IISC = GATI.olive;
const C_PRIVATE_LANG = GATI.grey;

// Fills light enough that white label text would fail contrast.
const LIGHT_FILLS = new Set([GATI.goldLight, GATI.sky, GATI.greyLight]);
function labelInk(color) {
  return LIGHT_FILLS.has(color) ? GATI.ink : "#ffffff";
}

// ---- view mode definitions (raw counts only, no derived scores) ----
const VIEW_MODES = {
  domain: {
    label: "Language vs Health",
    series: [
      { key: "language_total", label: "Language Infrastructure", color: C_GOETHE },
      { key: "health_total", label: "Health Infrastructure", color: C_NMC },
    ],
  },
  pairs: {
    label: "By category pair",
    series: [
      { key: "formal_german_raw", label: "Formal German Infrastructure (Goethe/PASCH/Zentrum + HEIs + Exam Centres)", color: C_GOETHE },
      { key: "general_skilling_raw", label: "General Skilling Infrastructure (PDOT/SIIC/IISC + Private Training)", color: C_PDOT },
      { key: "nursing_colleges", label: "INC Nursing Colleges", color: C_INC },
      { key: "medical_colleges", label: "NMC Medical Colleges", color: C_NMC },
      { key: "health_facilities", label: "NABH Accredited Health Facilities", color: C_NABH },
    ],
  },
  full: {
    label: "Fully disaggregated",
    series: [
      { key: "goethe_schools", label: "Goethe/PASCH/Zentrum Schools", color: C_GOETHE },
      { key: "heis_german", label: "HEIs Offering German", color: C_HEI },
      { key: "exam_centres", label: "Goethe/TELC Exam Centres", color: C_EXAM },
      { key: "pdot_siics", label: "PDOT/SIIC Centres", color: C_PDOT },
      { key: "iiscs", label: "IISC Centres", color: C_IISC },
      // Counts only -- private German training organisations are reported as
      // city totals with no geocoded addresses, so this chip moves a table
      // column and the aggregate figure but never draws a dot. Without it the
      // disaggregated view would silently total 548 fewer than the other two.
      { key: "private_training", label: "Private German Training Organisations", color: C_PRIVATE_LANG, countsOnly: true },
      { key: "nursing_colleges", label: "INC Nursing Colleges", color: C_INC },
      { key: "medical_colleges", label: "NMC Medical Colleges", color: C_NMC },
      { key: "health_facilities", label: "NABH Accredited Health Facilities", color: C_NABH },
    ],
  },
};

// Individual infrastructure points carry these subtypes. Exam Centres and
// Private German Training Organisations have no individually geocoded points in
// the source data -- they only exist as city/state totals, so their legend chips
// toggle a table column but no dots.
const POINT_SUBTYPE_META = {
  "Goethe/PASCH/Zentrum School": { domain: "language", pairsKey: "formal_german_raw", fullKey: "goethe_schools" },
  "HEI Offering German": { domain: "language", pairsKey: "formal_german_raw", fullKey: "heis_german" },
  "Goethe/TELC Exam Centre": { domain: "language", pairsKey: "formal_german_raw", fullKey: "exam_centres" },
  "PDOT Centre": { domain: "language", pairsKey: "general_skilling_raw", fullKey: "pdot_siics" },
  "SIIC Centre": { domain: "language", pairsKey: "general_skilling_raw", fullKey: "pdot_siics" },
  "IISC Centre (PMKK)": { domain: "language", pairsKey: "general_skilling_raw", fullKey: "iiscs" },
  // Retained only for rows that could not be matched back to a source section.
  "General Skilling Infrastructure (PDOT/SIIC/IISC)": { domain: "language", pairsKey: "general_skilling_raw", fullKey: "pdot_siics" },
  "NABH Accredited Health Facility": { domain: "health", pairsKey: "health_facilities", fullKey: "health_facilities" },
  "NMC Medical College": { domain: "health", pairsKey: "medical_colleges", fullKey: "medical_colleges" },
  "INC Nursing College": { domain: "health", pairsKey: "nursing_colleges", fullKey: "nursing_colleges" },
};

const DOMAIN_COLOR = { language: C_GOETHE, health: C_NMC };
const FALLBACK_COLOR = GATI.grey;

const CITY_PALETTE = [...d3.schemeTableau10, ...d3.schemeSet3];
let cityColorScale = null;
let stateColorScale = null;
let allIndiaStateColorScale = null;

let cities = [];
let states = [];
let infrastructure = [];
let renderableInfrastructure = [];
let trueCoordsOnly = false; // when true, hides pin_centroid ("hollow dot") points
let datasetMode = "pilot"; // "pilot" (15-city language+health) | "allIndia" (NABH+NMC+INC)
let allIndiaStates = [];
let allIndiaCities = [];
let allIndiaPoints = [];
let allIndiaCoverage = null;
let nabhEligibleOnly = true; // pilot layer: drop NABH rows flagged EXCLUDED/UNCERTAIN
let activeOwnership = new Set(["Government", "Private", "Not specified"]);
let viewMode = "domain";
let forcedLevel = "auto";
let activeMarkers = [];
let activeIndex = null;
let hoverTimer = null;

// Legend filter state: which series keys are currently switched on.
// Reset to "all on" whenever the view mode changes.
let activeCategories = new Set(VIEW_MODES[viewMode].series.map((s) => s.key));

const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
}).setView([20.7, 78.9], 5);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  maxZoom: 19,
}).addTo(map);

// Shared canvas renderer -- ~4,400 circleMarkers on one canvas instead of
// ~4,400 divIcon DOM nodes. This is what keeps the full-India dot view usable.
const infraCanvas = L.canvas({ padding: 0.3 });

// ---- All-India Health dataset (NABH + NMC + INC) ----
const ALL_INDIA_SERIES = [
  { key: "goethe_schools", label: "Goethe-Institut / Zentrum", color: C_GOETHE },
  { key: "exam_centres", label: "Goethe/TELC Exam Centres", color: C_EXAM },
  { key: "heis_german", label: "HEIs Offering German", color: C_HEI },
  { key: "pdot_siics", label: "PDOT/SIIC Centres", color: C_PDOT },
  { key: "iiscs", label: "IISC Centres", color: C_IISC },
  { key: "nabh_facilities", label: "NABH Accredited Health Facilities", color: C_NABH },
  { key: "nmc_colleges", label: "NMC Medical Colleges", color: C_NMC },
  { key: "inc_colleges", label: "INC Nursing Colleges", color: C_INC },
];
const ALL_INDIA_SUBTYPE_KEY = {
  "Goethe/PASCH/Zentrum School": "goethe_schools",
  "Goethe/TELC Exam Centre": "exam_centres",
  "HEI Offering German": "heis_german",
  "PDOT Centre": "pdot_siics",
  "SIIC Centre": "pdot_siics",
  "IISC Centre (PMKK)": "iiscs",
  "NABH Accredited Health Facility": "nabh_facilities",
  "NMC Medical College": "nmc_colleges",
  "INC Nursing College": "inc_colleges",
};

function currentSeries() {
  return datasetMode === "allIndia" ? ALL_INDIA_SERIES : VIEW_MODES[viewMode].series;
}

// Every series in every view mode maps to a count column in cities.json.
function countableSeries() {
  return currentSeries();
}

function activeSeries() {
  return countableSeries().filter((s) => activeCategories.has(s.key));
}

function resetActiveCategories() {
  activeCategories = new Set(currentSeries().map((s) => s.key));
}

function safeLevel() {
  if (forcedLevel !== "auto") return forcedLevel;
  const zoom = map.getZoom();
  if (zoom <= 6) return "state";
  if (zoom <= 9) return "city";
  return "infrastructure";
}

// Only sums series that are currently switched on, so bubble sizes and the
// table stay consistent with whatever is deselected in the legend.
function locationTotal(row) {
  return activeSeries().reduce((sum, s) => sum + (row[s.key] || 0), 0);
}

// The series key an individual infra point maps to under the current view mode.
// Returns null when the point's subtype has no matching series (e.g. the
// PDOT/SIIC/IISC bundle in "Fully disaggregated", which is split across three
// series that individual points cannot be attributed to).
function seriesKeyForPoint(point) {
  if (datasetMode === "allIndia") {
    const key = ALL_INDIA_SUBTYPE_KEY[point.subtype];
    return key && currentSeries().some((s) => s.key === key) ? key : null;
  }
  const meta = POINT_SUBTYPE_META[point.subtype];
  if (!meta) return null;
  if (viewMode === "domain") return `${meta.domain}_total`;
  const key = viewMode === "pairs" ? meta.pairsKey : meta.fullKey;
  return currentSeries().some((s) => s.key === key) ? key : null;
}

function isPointActive(point) {
  const key = seriesKeyForPoint(point);
  if (key === null) return true; // unmapped subtypes are never filtered out
  return activeCategories.has(key);
}

function isOwnershipActive(point) {
  if (datasetMode !== "allIndia") return true;
  return activeOwnership.has(point.ownership || "Not specified");
}

// Pilot NABH rows carry an eligibilityFlag from reconcile_flags.py. With the
// toggle on, EXCLUDED rows (AYUSH, labs, imaging, blood banks, dental clinics,
// ethics committees) come off the map entirely, but UNCERTAIN rows stay and are
// drawn hollow: they have real coordinates, and the 107-facility gap between
// the consolidated table and the eligible points sits inside this class, so
// hiding them outright would erase exactly the rows that need validating.
function isEligiblePilotPoint(p) {
  if (!nabhEligibleOnly) return true;
  if (p.subtype !== "NABH Accredited Health Facility") return true;
  return p.eligibilityFlag !== "EXCLUDED";
}

// Hollow = "do not trust this dot as-is": either the coordinate is approximate,
// or the facility's corridor eligibility could not be resolved.
function isProvisionalPoint(p) {
  return p.coordinateStatus === "pin_centroid" || p.eligibilityFlag === "UNCERTAIN";
}

function coordinateFilteredInfrastructure() {
  return renderableInfrastructure.filter(
    (p) => isEligiblePilotPoint(p) && (!trueCoordsOnly || p.coordinateStatus !== "pin_centroid")
  );
}

function pointsForLevel(level) {
  if (datasetMode === "allIndia") {
    if (level === "state") return allIndiaStates.map((s) => ({ ...s, levelName: s.state }));
    if (level === "city") return allIndiaCities.map((c) => ({ ...c, levelName: c.city }));
    return allIndiaPoints.filter((p) => isPointActive(p) && isOwnershipActive(p));
  }
  if (level === "state") return states.map((s) => ({ ...s, levelName: s.state }));
  if (level === "city") return cities.map((c) => ({ ...c, levelName: c.city }));
  return coordinateFilteredInfrastructure().filter(isPointActive);
}

function featureForPoint(point, level) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
    properties: { ...point, level },
  };
}

// State/city levels still cluster. Infrastructure level does NOT -- every dot is
// drawn individually at any zoom, so wide zoom-outs no longer collapse into
// grey count-bubbles.
function buildIndex(level) {
  if (level === "infrastructure") {
    activeIndex = null;
    return;
  }
  const points = pointsForLevel(level).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  const features = points.map((p) => featureForPoint(p, level));
  activeIndex = new Supercluster({
    radius: 44,
    maxZoom: 11,
    map: (props) => ({ count: 1, total: locationTotal(props) }),
    reduce: (accumulated, props) => {
      accumulated.count += props.count;
      accumulated.total += props.total;
    },
  }).load(features);
}

function clearMarkers() {
  activeMarkers.forEach((m) => m.remove());
  activeMarkers = [];
}

function drawMarkers() {
  const level = safeLevel();
  clearMarkers();
  buildIndex(level);
  const bounds = map.getBounds().pad(0.2);

  if (level === "infrastructure") {
    // Raw dot mode: no clustering, canvas-rendered circle markers.
    pointsForLevel("infrastructure").forEach((point) => {
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;
      if (!bounds.contains([point.latitude, point.longitude])) return;
      const marker = infrastructureMarker(point, point.latitude, point.longitude);
      marker.addTo(map);
      activeMarkers.push(marker);
    });
    renderTable(level);
    return;
  }

  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  const clusters = activeIndex.getClusters(bbox, Math.round(map.getZoom()));
  clusters.forEach((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const props = feature.properties;
    const marker = props.cluster
      ? clusterMarker(feature, level, latitude, longitude)
      : pointMarker(feature, level, latitude, longitude);
    marker.addTo(map);
    activeMarkers.push(marker);
  });
  renderTable(level);
}

function radiusForTotal(total, maxTotal) {
  const ratio = maxTotal > 0 ? total / maxTotal : 0;
  return Math.round(20 + ratio * 46);
}

// The table/bubble rows behind a given zoom level, for whichever dataset is on.
function rowsForLevel(level) {
  if (datasetMode === "allIndia") return level === "city" ? allIndiaCities : allIndiaStates;
  return level === "state" ? states : cities;
}

function maxTotalForLevel(level) {
  const rows = rowsForLevel(level);
  return Math.max(1, ...rows.map((r) => locationTotal(r)));
}

function clusterMarker(feature, level, latitude, longitude) {
  const props = feature.properties;
  const maxTotal = maxTotalForLevel(level);
  const size = radiusForTotal(props.total, maxTotal);
  const marker = L.marker([latitude, longitude], {
    icon: L.divIcon({
      html: `<div class="cluster-bubble" style="width:${size}px;height:${size}px;background:#5b6673">${format.format(props.point_count)}</div>`,
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    }),
  });
  marker.on("click", () => {
    const expansionZoom = Math.min(activeIndex.getClusterExpansionZoom(props.cluster_id), 16);
    map.setView([latitude, longitude], expansionZoom);
  });
  bindHover(marker, () => clusterHoverHtml(level, props));
  return marker;
}

function clusterHoverHtml(level, props) {
  return `<strong>${format.format(props.point_count)} ${level === "state" ? "states" : "cities"} clustered</strong><div>Total ${VIEW_MODES[viewMode].label.toLowerCase()}: ${format.format(props.total)}</div>`;
}

function pointMarker(feature, level, latitude, longitude) {
  const point = feature.properties;
  const maxTotal = maxTotalForLevel(level);
  const total = locationTotal(point);
  const size = radiusForTotal(total, maxTotal);
  const colorScale = datasetMode === "allIndia" ? allIndiaStateColorScale : level === "state" ? stateColorScale : cityColorScale;
  const color = colorScale(point.levelName);
  const marker = L.marker([latitude, longitude], {
    icon: L.divIcon({
      html: `<div class="marker-bubble" style="width:${size}px;height:${size}px;background:${color}">${format.format(total)}</div>`,
      className: "",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    }),
  });
  bindHover(marker, () => locationHoverHtml(point));
  return marker;
}

function locationHoverHtml(point) {
  const rows = countableSeries()
    .map((s) => {
      const off = activeCategories.has(s.key) ? "" : " hover-row--off";
      return `<div class="hover-row${off}"><span>${s.label}</span><b>${format.format(point[s.key] || 0)}</b></div>`;
    })
    .join("");
  return `<strong>${point.levelName}</strong>${rows}`;
}

// Canvas circleMarker -- cheap enough to draw every point at any zoom.
function infrastructureMarker(point, latitude, longitude) {
  const color = pointColor(point);
  // Approximate coordinates (PIN-code centroids, shared points) render hollow:
  // coloured ring, no fill, so precision is visible at a glance.
  const approximate = isProvisionalPoint(point);
  const marker = L.circleMarker([latitude, longitude], {
    renderer: infraCanvas,
    radius: approximate ? 5 : 4.5,
    weight: approximate ? 1.6 : 1,
    color: approximate ? color : "#ffffff",
    opacity: approximate ? 1 : 0.9,
    fillColor: color,
    fillOpacity: approximate ? 0 : 0.95,
  });
  bindHover(marker, () => infrastructureHoverHtml(point));
  return marker;
}

function pointColor(point) {
  if (datasetMode === "allIndia") {
    const key = ALL_INDIA_SUBTYPE_KEY[point.subtype];
    const series = ALL_INDIA_SERIES.find((s) => s.key === key);
    return series ? series.color : FALLBACK_COLOR;
  }
  const meta = POINT_SUBTYPE_META[point.subtype];
  if (!meta) return FALLBACK_COLOR;
  if (viewMode === "domain") return DOMAIN_COLOR[meta.domain];
  const key = viewMode === "pairs" ? meta.pairsKey : meta.fullKey;
  const series = currentSeries().find((s) => s.key === key);
  return series ? series.color : FALLBACK_COLOR;
}

function infrastructureDetailRows(point) {
  const fields = [
    ["Facility type", point.facilityType],
    ["Ownership", point.ownership],
    ["Corridor eligibility flag", point.eligibilityFlag],
    ["Status", point.status],
    ["NABH status", point.nabhStatus],
    ["Corridor eligibility", point.corridorEligibility],
  ];
  return fields
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="hover-row"><span>${label}</span><b>${value}</b></div>`)
    .join("");
}

const STATUS_LABEL = {
  source: "As given in source data",
  pin_centroid: "Approximate \u2014 PIN-code centroid or point shared with another institution",
  researched_override: "Corrected \u2014 source coordinate was wrong, replaced after research",
};

function infrastructureHoverHtml(point) {
  const status = STATUS_LABEL[point.coordinateStatus] || point.coordinateStatus;
  return `
    <strong>${point.name || "Unnamed entry"}</strong>
    <div class="hover-row"><span>Category</span><b>${point.subtype}</b></div>
    <div class="hover-row"><span>City</span><b>${point.city}</b></div>
    ${infrastructureDetailRows(point)}
    <div class="hover-note">Coordinate: ${status}.${
      point.ownershipBasis ? ` Ownership: ${point.ownershipBasis.toLowerCase()}.` : ""
    }</div>
  `;
}

// ---- hover card ----
const hoverCard = document.getElementById("hover-card");

function bindHover(marker, htmlFn) {
  marker.on("mouseover", (e) => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showHoverCard(htmlFn(), e.originalEvent), HOVER_DELAY_MS);
  });
  marker.on("mousemove", (e) => {
    if (!hoverCard.hidden) positionHoverCard(e.originalEvent);
  });
  marker.on("mouseout", () => {
    clearTimeout(hoverTimer);
    hoverCard.hidden = true;
  });
}

function showHoverCard(html, originalEvent) {
  hoverCard.innerHTML = html;
  hoverCard.hidden = false;
  positionHoverCard(originalEvent);
}

function positionHoverCard(originalEvent) {
  if (!originalEvent) return;
  const mapRect = document.getElementById("map").getBoundingClientRect();
  hoverCard.style.left = `${originalEvent.clientX - mapRect.left + 16}px`;
  hoverCard.style.top = `${originalEvent.clientY - mapRect.top + 16}px`;
}

// ---- aggregate summary strip ----
// Fixed totals across all 15 cities, summed from cities.json. Deliberately NOT
// derived from visible dots: that would be expensive and would change on pan.
// Refreshed on view-mode change and initial load only.
function mappedPointCounts() {
  const counts = new Map();
  const source = datasetMode === "allIndia" ? allIndiaPoints : coordinateFilteredInfrastructure();
  source.forEach((point) => {
    const key = seriesKeyForPoint(point);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function renderAggregateSummary() {
  const host = document.getElementById("aggregate-summary");
  if (!host) return;

  if (datasetMode === "allIndia") {
    if (!allIndiaStates.length) {
      host.innerHTML = "";
      return;
    }
    const mapped = mappedPointCounts();
    let grandCounted = 0;
    let government = 0;
    let privateCount = 0;
    allIndiaStates.forEach((s) => {
      government += s.government;
      privateCount += s.private;
    });
    const items = ALL_INDIA_SERIES.map((s) => {
      const counted = allIndiaStates.reduce((sum, st) => sum + (st[s.key] || 0), 0);
      grandCounted += counted;
      const off = activeCategories.has(s.key) ? "" : " summary-item--off";
      return `<div class="summary-item${off}">
        <span class="swatch" style="background:${s.color}"></span>
        <b>${format.format(counted)}</b>
        <span class="summary-label">${s.label}</span>
      </div>`;
    }).join("");
    host.innerHTML =
      `<div class="summary-title">All-India (Language + Health) &middot; ${allIndiaStates.length} states/UTs &middot; ` +
      `${format.format(grandCounted)} points &middot; ` +
      `<span class="summary-gap">ownership split shown for every layer except NABH ` +
      `(${format.format(government + privateCount)} of ${format.format(grandCounted)}): ` +
      `${format.format(government)} government, ${format.format(privateCount)} private</span> &middot; ` +
      `<span class="summary-gap">NABH source carries no per-facility ownership field</span></div>` +
      `<div class="summary-items">${items}</div>`;
    return;
  }

  if (!cities.length) {
    host.innerHTML = "";
    return;
  }

  const mapped = mappedPointCounts();
  let grandCounted = 0;
  let grandMapped = 0;

  const items = countableSeries()
    .map((s) => {
      const counted = cities.reduce((sum, c) => sum + (c[s.key] || 0), 0);
      const points = mapped.get(s.key) || 0;
      grandCounted += counted;
      grandMapped += points;

      // Flag the two ways the official count and the map can disagree, so a
      // gap in the source data never looks like a rendering bug.
      let detail = "";
      if (points === 0 && counted > 0) {
        detail = `<span class="summary-gap">counts only \u2014 no mapped points</span>`;
      } else if (points !== counted) {
        detail = `<span class="summary-gap">${format.format(points)} mapped</span>`;
      }

      const off = activeCategories.has(s.key) ? "" : " summary-item--off";
      return `<div class="summary-item${off}">
        <span class="swatch" style="background:${s.color}"></span>
        <b>${format.format(counted)}</b>
        <span class="summary-label">${s.label}</span>
        ${detail}
      </div>`;
    })
    .join("");

  const centroidCount = coordinateFilteredInfrastructure().filter(isProvisionalPoint).length;
  const nabhRows = renderableInfrastructure.filter((p) => p.subtype === "NABH Accredited Health Facility");
  const excluded = nabhRows.filter((p) => p.eligibilityFlag === "EXCLUDED").length;
  const uncertain = nabhRows.filter((p) => p.eligibilityFlag === "UNCERTAIN").length;
  const eligibilityNote = nabhEligibleOnly
    ? `<span class="summary-gap">${format.format(excluded)} NABH rows corridor-ineligible, hidden &middot; ${format.format(uncertain)} unresolved, drawn hollow</span>`
    : `<span class="summary-gap">${format.format(excluded)} corridor-ineligible and ${format.format(uncertain)} unresolved NABH rows shown</span>`;
  const centroidNote = trueCoordsOnly
    ? `<span class="summary-gap">${format.format(centroidCount)} provisional (hollow) points</span>`
    : `<span class="summary-gap">${format.format(centroidCount)} provisional (hollow) points</span>`;

  host.innerHTML =
    `<div class="summary-title">All 15 cities &middot; ${VIEW_MODES[viewMode].label} &middot; ` +
    `${format.format(grandCounted)} counted &middot; ${format.format(grandMapped)} mapped &middot; ${centroidNote} &middot; ${eligibilityNote}</div>` +
    `<div class="summary-items">${items}</div>`;
}

// ---- legend ----
const OWNERSHIP_COLORS = { Government: GATI.teal, Private: GATI.rust, "Not specified": GATI.grey };

function renderLegend() {
  const legend = document.getElementById("legend");
  const level = safeLevel();
  if (level === "infrastructure") {
    const categoryChips = currentSeries()
      .map((s) => {
        const on = activeCategories.has(s.key);
        const style = on
          ? `background:${s.color};border-color:${s.color};color:${labelInk(s.color)};`
          : `background:transparent;border-color:${s.color};color:${s.color};`;
        const dot = on ? labelInk(s.color) : s.color;
        const note = s.countsOnly ? '<span class="chip-note">counts only</span>' : "";
        return `<button type="button" class="legend-chip${on ? " active" : ""}" data-key="${s.key}" aria-pressed="${on}" style="${style}"><span class="chip-dot" style="background:${dot}"></span>${s.label}${note}</button>`;
      })
      .join("");
    legend.innerHTML = categoryChips;
    legend.querySelectorAll(".legend-chip[data-key]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.key;
        if (activeCategories.has(key)) activeCategories.delete(key);
        else activeCategories.add(key);
        renderAggregateSummary();
        drawMarkers();
      });
    });
    return;
  }
  const scopeLabel = datasetMode === "allIndia" ? "all-India infrastructure" : VIEW_MODES[viewMode].label.toLowerCase();
  legend.innerHTML = `<div class="legend-note">Bubble color reflects each ${level === "state" ? "state" : "city"}; bubble size reflects total ${scopeLabel} across selected categories.</div>`;
}

// ---- location table ----
// All-India city rows are grouped under a state band so every city in a state
// reads as one block; the state name and the city name are the two frozen
// columns on the left, category counts scroll horizontally underneath.
function renderTable(level) {
  if (datasetMode === "allIndia" && level === "city") {
    level = "state";
  }
  renderLegend();
  const container = document.getElementById("location-table");
  const series = countableSeries();
  container.style.setProperty("--col-count", series.length);
  const grouped = datasetMode === "allIndia" && level === "city";
  container.classList.toggle("location-table--grouped", grouped);

  const head =
    `<div class="table-row table-head">` +
    (grouped ? `<span>State</span><span>City</span>` : `<span>${datasetMode === "allIndia" || level === "state" ? "State" : "City"}</span>`) +
    series.map((s) => `<span${activeCategories.has(s.key) ? "" : ' class="col-off"'}>${s.label}</span>`).join("") +
    `<span>Selected total</span></div>`;

  const cellsFor = (row) =>
    series
      .map((s) => `<span${activeCategories.has(s.key) ? "" : ' class="col-off"'}>${format.format(row[s.key] || 0)}</span>`)
      .join("");

  let body;
  if (grouped) {
    const byState = new Map();
    allIndiaCities.forEach((row) => {
      if (!byState.has(row.state)) byState.set(row.state, []);
      byState.get(row.state).push(row);
    });
    body = [...byState.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([state, rows]) => {
        const sorted = rows.slice().sort((a, b) => b.total - a.total || a.city.localeCompare(b.city));
        const band =
          `<div class="table-row table-band"><span>${state}</span>` +
          `<span>${format.format(sorted.length)} ${sorted.length === 1 ? "city" : "cities"}</span>` +
          series.map(() => `<span></span>`).join("") +
          `<span class="row-total">${format.format(sorted.reduce((t, r) => t + locationTotal(r), 0))}</span></div>`;
        return band + sorted
          .map((row) =>
            `<div class="table-row table-row--child"><span class="cell-state">${state}</span>` +
            `<span>${row.city}</span>${cellsFor(row)}` +
            `<span class="row-total">${format.format(locationTotal(row))}</span></div>`)
          .join("");
      })
      .join("");
  } else {
    const rows = rowsForLevel(level);
    const isStateLabel = datasetMode === "allIndia" || level === "state";
    body = rows
      .slice()
      .sort((a, b) => (a.levelName || a.city || a.state).localeCompare(b.levelName || b.city || b.state))
      .map(
        (row) =>
          `<div class="table-row"><span>${isStateLabel ? row.state : row.city}</span>${cellsFor(row)}` +
          `<span class="row-total">${format.format(locationTotal(row))}</span></div>`
      )
      .join("");
  }

  container.innerHTML = coverageNoteHtml(level) + head + body;
}

// Says out loud how much of the layer could be placed on a city row, so a
// missing city never looks like a missing facility.
function coverageNoteHtml(level) {
  if (datasetMode !== "allIndia" || level !== "city" || !allIndiaCoverage) return "";
  const c = allIndiaCoverage;
  return `<p class="table-note">${format.format(c.cities)} cities across ${format.format(c.states)} states/UTs.
    ${format.format(c.cityAttributed)} of ${format.format(c.totalPoints)} points carry a city;
    ${format.format(c.cityMissing)} do not and appear only in the state view and on the map.
    City is parsed from free-text postal addresses, so only cities named in the source extracts appear here.</p>`;
}

// ---- controls ----
document.querySelectorAll(".level-button").forEach((button) => {
  button.addEventListener("click", () => {
    forcedLevel = button.dataset.level;
    document.querySelectorAll(".level-button").forEach((b) => b.classList.toggle("active", b === button));
    drawMarkers();
  });
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    viewMode = button.dataset.mode;
    resetActiveCategories();
    document.querySelectorAll(".mode-button").forEach((b) => b.classList.toggle("active", b === button));
    renderAggregateSummary();
    drawMarkers();
  });
});

document.querySelectorAll(".dataset-button").forEach((button) => {
  button.addEventListener("click", () => {
    datasetMode = button.dataset.dataset;
    document.querySelectorAll(".dataset-button").forEach((b) => b.classList.toggle("active", b === button));
    document.body.classList.toggle("all-india-mode", datasetMode === "allIndia");
    resetActiveCategories();
    activeOwnership = new Set(["Government", "Private", "Not specified"]);
    document.querySelectorAll(".ownership-toggle input").forEach((i) => (i.checked = true));
    renderAggregateSummary();
    drawMarkers();
  });
});

map.on("zoomend moveend", () => {
  drawMarkers();
});

const nabhToggle = document.getElementById("nabh-eligible-toggle");
if (nabhToggle) {
  nabhToggle.checked = nabhEligibleOnly;
  nabhToggle.addEventListener("change", () => {
    nabhEligibleOnly = nabhToggle.checked;
    renderAggregateSummary();
    drawMarkers();
  });
}

document.querySelectorAll(".ownership-toggle input").forEach((input) => {
  input.addEventListener("change", () => {
    const key = input.dataset.ownership;
    if (input.checked) activeOwnership.add(key);
    else activeOwnership.delete(key);
    drawMarkers();
  });
});

const trueCoordsToggle = document.getElementById("true-coords-toggle");
if (trueCoordsToggle) {
  trueCoordsToggle.addEventListener("change", () => {
    trueCoordsOnly = trueCoordsToggle.checked;
    renderAggregateSummary();
    drawMarkers();
  });
}

const RENDERABLE_STATUSES = new Set(["source", "pin_centroid", "researched_override"]);

function isRenderableInfra(point) {
  // "duplicate_collapsed" and "undefined_flagged" stay in the data but off the map.
  return (
    RENDERABLE_STATUSES.has(point.coordinateStatus) &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    !(point.latitude === 0 && point.longitude === 0)
  );
}

Promise.all([
  fetch("../data/cities.json").then((r) => r.json()),
  fetch("../data/states.json").then((r) => r.json()),
  fetch("../data/infrastructure-cleaned.json").then((r) => r.json()),
  fetch("../data/all-india-states.json").then((r) => r.json()),
  fetch("../data/all-india-cities.json").then((r) => r.json()),
  fetch("../data/all-india-coverage.json").then((r) => r.json()),
  fetch("../data/all-india-health-points.json").then((r) => r.json()),
  fetch("../data/all-india-language-points.json").then((r) => r.json()),
])
  .then(([cityRows, stateRows, infraRows, allIndiaStateRows, allIndiaCityRows, coverage, healthPoints, languagePoints]) => {
    cities = cityRows;
    states = stateRows;
    infrastructure = infraRows;
    allIndiaStates = allIndiaStateRows;
    allIndiaCities = allIndiaCityRows;
    allIndiaCoverage = coverage;
    allIndiaPoints = [...healthPoints, ...languagePoints].filter(isRenderableInfra);
    renderableInfrastructure = infrastructure.filter(isRenderableInfra);
    cityColorScale = d3.scaleOrdinal().domain(cities.map((c) => c.city)).range(CITY_PALETTE);
    stateColorScale = d3.scaleOrdinal().domain(states.map((s) => s.state)).range(CITY_PALETTE);
    allIndiaStateColorScale = d3.scaleOrdinal().domain(allIndiaStates.map((s) => s.state)).range(CITY_PALETTE);
    console.info(
      `[infrastructure-layer] renderable=${renderableInfrastructure.length} dropped=${infrastructure.length - renderableInfrastructure.length} total=${infrastructure.length}`
    );
    resetActiveCategories();
    renderAggregateSummary();
    drawMarkers();
  })
  .catch((error) => {
    document.getElementById("location-table").innerHTML = `<p class="detail-copy">Data load failed: ${error.message}</p>`;
  });
