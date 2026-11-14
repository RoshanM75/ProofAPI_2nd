# Proof API — Verification Dashboard (Team P05)

**AI-powered climate-action verification · high-fidelity interactive prototype v0.2**

<div align="center">

![QR code — scan to open the demo](assets/qr.png)

**Scan to open the demo on your phone** · `https://github.com/gunnarcosmo1123-oss/proof-api-dashboard`

</div>

> 中文摘要:这是 Proof API 的可交互高保真原型——照片提交审核、AI 三模型验证评分、重复检测拦截、结果总览分析,外加证据核查智能体;v0.2 新增组织分层分析(组织 → 城市 → 国家 → 全球)、全球行动地图(国家项目清单 + 日期回放)、行动覆盖缺口分析与行动大类(环境类 / 能源类)。纯前端零依赖,双击 index.html 即用,离线可演示,中英双语。

---

## Quick start

- **Open `index.html`** in any modern browser (double-click works, no server, no dependencies, works offline).
- Language: top-right toggle. Default follows your **browser language** (three-level fallback: `?lang=` → localStorage → `navigator.language`); force it with `index.html?lang=en`.
- Mobile: the repo ships a PWA manifest + icons — open the URL and "Add to Home Screen".
- Data self-check: `node build/test-data.js` (validates all dataset invariants); QR generator self-check: `node build/verify-qr.js`.
- Debug URLs: `?tab=map` jumps to the action map, `?map-country=Malaysia` preselects a country, `?map-date=2026-11-10` preselects a replay date, `?drawer=PA-1082` opens a submission detail, `?agent=PA-1082` auto-runs an agent investigation, `?demo-submit=1` runs one scripted photo submission end-to-end, `?demo-submit=2` submits the same photo twice (second one gets flagged as an exact-hash duplicate), **`?tour=1` auto-plays the 90-second narrated story** (upload → real verification → cropped/filtered resubmission → DUP_PHASH interception → the carbon price tag → agent evidence chain; pause / step / skip controls, zero network calls), `?offline=1` shows the static offline first screen.

## One clear flow — submit → result → flags → receipt

The first tab (**提交验证 / Submit**) is the end-to-end flow Sadaf asked for:

1. **Upload & claim** — drag-and-drop or file picker, live preview with file info (size / dimensions / type), claimed action type, location, optional submitter name, **submit-as toggle (individual / organisation) with an organisation picker** (choosing an org auto-fills its city; an **"Other"** option accepts a free-text org name → `org: 'custom:<name>'`, which becomes an *unregistered-organisation risk signal*), and an **action date** field (used by the action map's date replay). A **⚡ sample-photo button** generates a synthetic photo so the flow can be demoed with one click.
2. **AI verification** — animated pipeline: ingest & fingerprint → 3-model verification → duplicate detection → receipt. **Real client-side computation**: SHA-256 of the file, **pHash-DCT 64-bit perceptual fingerprint** (32×32 grayscale → hand-written 2-D DCT → low-freq 8×8 minus DC → median threshold), Laplacian noise variance (authenticity heuristic), HSV color-profile cosine similarity (action-match **color-prior heuristic**, labelled as such), **ELA error-level analysis** (JPEG q90 re-encode → per-pixel diff heatmap + high-error share), **hand-written JPEG APP1/TIFF EXIF parsing** (GPS, Make/Model, Software, DateTimeOriginal), and a **C2PA/XMP provenance scan** of the file bytes. Geolocation is a **haversine distance from EXIF GPS to the claimed city** when GPS exists; otherwise a clearly-labelled demo-derived score.
3. **Result & flags** — verdict banner (verified / pending / rejected / duplicate-flagged), composite score ring, sub-model bars, and a flags panel: `DUP_EXACT`, `DUP_PHASH`, `AUTH_SMOOTH`, `ACTION_MISMATCH`, `GEO_LOW` (or "✓ no flags"). Rule: **any flag blocks auto-approval** — duplicate → flagged, score < 60 → rejected, otherwise flags force human review.
4. **Receipt** — a printable verification receipt: submission ID, SHA-256 & pHash, claim details, pipeline checklist, model breakdown, and a status stamp. **🖨 Print** uses print CSS to output only the receipt.

Every submitted photo is registered into the live dataset: it appears in the Review Queue, updates the Overview KPIs, joins the Duplicates tab when flagged (submit the same file twice to see a real exact-hash interception, group G-06+), and can be handed to the evidence-check agent for an investigation. Session submissions persist in localStorage and survive reloads; the stored registry carries a hash-algorithm version marker, and entries from older algorithm versions are transparently rebuilt from their thumbnails on load instead of producing cross-version false matches.

## What Proof API does

Citizens and field teams — **as individuals or on behalf of an organisation** — submit **photos as evidence of climate actions** (afforestation, rooftop solar, wetland restoration, EV charging, coastal cleanup, building retrofit), grouped into two large categories: **Environmental (环境类)** and **Energy (能源类)**. Every submission goes through an automated pipeline:

```
Mobile submission → Ingestion → 3-model verification → Duplicate detection → Agent evidence check → Publish result
```

The dashboard covers the four review dimensions from our brief — **photo submissions, verification scores, duplicate flags, results** — plus the evidence-check agent slot, and the v0.2 planning layer: **hierarchy analytics (org → city → country → global)**, a **global action map** with per-country project lists and date replay, and **action coverage gap analysis**.

## Information architecture (8 modules)

| Module | Purpose | Key interactions |
|---|---|---|
| **Submit** | The end-to-end flow | Upload → animated verification → verdict + flags → forensics panel (ELA heatmap / EXIF / C2PA) → printable receipt; individual/organisation toggle + org picker with an **"Other — free-text name"** option; action date; one-click sample-photo demo; session submission history |
| **Overview** | Pipeline health & 14-day window | 5 KPIs, stacked daily volume by outcome, score histogram, action-type ranking (grouped by category), live feeds with org labels |
| **Review queue** | Core review workflow | Status/action filters, photo cards with composite ring + 3 sub-score bars and org chips, detail drawer, approve / reject (updates KPIs live), one-click dispatch to the agent |
| **Duplicates** | Duplicate groups & interception | 5 groups (exact hash / perceptual hash / crop-filter variants), side-by-side photo comparison with similarity meters & time gaps, confirm / mark-false-positive |
| **Analytics** | Model performance + planning layer | Hierarchy drill-down (global → country → city → org → submissions), **coverage-gap cards** ("X is active here but Y is under-served — suggest Y projects"), plus the v0.1 charts (throughput, per-type deviation, sub-model means, thresholds, auto-vs-human agreement) |
| **Action map** | Where projects happen | Natural Earth world map (offline, embedded), countries colored by verified-project ramp, city dots sized by submission count; click a country → project list with verified/duplicate/rejected/pending counts, city chips, and a **date-replay strip** (click a date → that day's actions) |
| **Agent** | Evidence cross-check agent | Pipeline diagram with the agent slot, conversational agent that runs a 4-step investigation (metadata → forensics with real ELA heatmap → geospatial → registry with real counts) and outputs a verdict with confidence and a citable evidence chain; unregistered orgs → `ORG_UNREGISTERED` → human review |
| **About** | Honesty layer & attribution | "What is actually computed" table (measured / heuristic / demo-rule labels), demo-data notice, privacy statement, QR code + repo link, full Wikimedia Commons photo attribution list |

### The planning layer (v0.2)

- **Hierarchy**: every submission carries an `org` (14 demo organisations: NGOs, companies, community groups) or is individual. Analytics drill from **global → country → city → organisation**, so a country coordinator sees exactly her city's org performance.
- **Gap analysis**: on **verified** projects only, per scope (global + countries with enough data), the engine flags (a) *category gaps* — e.g. Kenya: environmental 100% vs energy 0% → suggest EV charging — and (b) *within-category action gaps* — e.g. Kenya/Malaysia: afforestation/cleanup dominate while **wetland restoration is missing**. Cards carry a suggested action and share bars.
- The demo dataset is engineered (deterministically) so each country tells a story: Kenya & Malaysia over-serve coastal/environmental actions, Mumbai over-serves energy, China is fairly balanced.

## Verification model (demo rules, honestly labelled)

```
composite = authenticity × 40% + action-match × 35% + geolocation × 25%   (0–100)
```

Every score source is labelled in the UI (result page, drawer, About tab):

| Component | What it actually is | Label |
|---|---|---|
| authenticity | Laplacian noise-spectrum variance | noise spectrum · measured |
| action-match | HSV 6-bucket cosine similarity vs a hand-written color prior | **color prior · heuristic** |
| geolocation | haversine distance from EXIF GPS to the claimed city; demo-derived when no GPS | EXIF GPS · measured / demo-derived |
| ELA / EXIF / C2PA | real JPEG re-encode diff, real APP1/TIFF parse, real byte-stream provenance scan | measured |
| composite & verdict | threshold rules (demo) | demo rule |

- **≥ 85** auto-verified · **60–85** human review · **< 60** auto-rejected · any sub-model < 60 forces review
- Duplicate hits are flagged regardless of score (interception takes precedence).
- Unregistered organisations (`custom:<name>`) downgrade the agent verdict to human review (`ORG_UNREGISTERED`).
- Demo dataset: 66 submissions (2026-10-31 → 11-13), deterministic seed — 14 cities in 8 countries (China, Kenya, Indonesia, Colombia, Malaysia, India, Brazil, Nigeria), 14 organisations + individuals, 6 actions in 2 categories. 12 today, 11 pending, 66.7% auto-approved, 10.6% duplicate interception, avg score 85.1. Auto-vs-human agreement 94.4%.

## Carbon numbers (reference estimates, honestly labelled)

- Every submission carries an estimated **tCO2e** from a public factor table — IPCC 2019 Refinement (afforestation), IPCC 2013 Wetlands Supplement, MEE China 2023 grid factor × unit sizes (solar / retrofit), IEA passenger-car intensity (EV); cleanup is a high-uncertainty indirect estimate. The full table with sources and years lives in the **Analytics** tab.
- Overview shows **verified mitigation delivered (tCO2e)**; every intercepted duplicate group shows **what it would have paid out** (≈ tCO2e × the EU ETS reference price of €80/t).
- Every figure is labelled **"reference estimate · not issued credits"** — the prototype estimates scale; it does not mint credits.
- **Verification footprint**: latency is measured per submission and shown on the receipt; gCO2e = measured ms × a 7 W device-power assumption × the grid factor. The footprint ratio against certified mitigation lands around **1 : 10⁸–10⁹ on-device** — cloud GPU inference would worsen it by 2–3 orders of magnitude. Everything runs locally; no data centre, no upload.
- **Calibration**: the Analytics tab bins composite scores (85–89 / 90–94 / 95–100) against auto-approvals with a demo human-agreement reference line — and states plainly that real calibration requires real review logs.

## Duplicate detection (3 channels, as shown in the demo)

1. **Exact hash** — identical file fingerprint, blocked outright (group G-01).
2. **Perceptual hash** (pHash-DCT 64-bit) — 32×32 grayscale → hand-written 2-D DCT → low-frequency 8×8 block (DC excluded) → median threshold; Hamming distance < 8 after compression/crop/filter (G-02, G-03).
3. **Visual embeddings** — deep-model cosine similarity ≥ 0.85 enters a review group (G-04, G-05).

Blocking resubmissions directly prevents **double carbon-credit issuance**, the main financial risk the dedupe layer guards against.

## The evidence-check agent — how it complements the workflow

The agent sits **between duplicate detection and result publishing**. The models answer "does the photo match the claim?"; the agent answers *"should we believe this submission?"* by pulling external evidence:

1. **Read metadata** — EXIF, GPS, SHA-256, claimed location
2. **Image forensics** — real ELA heatmap (shown inline), EXIF signals (Photoshop trace, capture-time vs claimed date, missing EXIF) and C2PA/XMP provenance; measured numbers drive the wording
3. **Geospatial cross-check** — EXIF GPS → haversine distance to the claimed city; honestly labelled as demo-derived when no GPS
4. **Registry comparison** — real dataset counts (same city + same action + same quarter), pHash index lookup, and an `ORG_UNREGISTERED` warning for custom organisations
5. **Verdict** — approve / reject / hold, with confidence % and a citable evidence chain (unregistered orgs are downgraded to human review)

In the prototype the agent is a deterministic rules engine wired to live dashboard state (same architecture as our ClimateOS assistant), so the full agent loop is demonstrable offline. It can be invoked from any submission detail panel ("Send to agent"), which deep-links into the agent tab and runs the investigation. The UI is deliberately structured as *step bubbles + tool-call chips + evidence*, which maps 1:1 onto a real agent trace later.

**Sketch of the real API contract (v0.2+)** — the UI is already organized around these boundaries:

```
POST   /submissions               photo + claim + geotag
GET    /submissions/:id           composite + sub-scores + status
GET    /submissions/:id/verdict   Agent investigation & evidence chain
GET    /duplicates?sim>=0.85      groups, similarity, originals
POST   /duplicates/:group/confirm | /dismiss
GET    /agents/investigate/:id   (streamed step events)
```

### The API boundary (`js/api.js`)

The entire UI consumes one function — `proofApiSubmit(payload)` — and one result shape. **When the real Proof API format arrives, only this file changes; the UI stays untouched.**

```js
// payload
{ file: File, action: 'solar'|'wetland'|…, city: 0-13,
  submitter: 'name', org: 'org-gbg'|'custom:<name>'|null,
  orgType: 'ngo'|'company'|'community'|'personal'|null,
  date: 'YYYY-MM-DD'|null }

// result
{
  ok: true,
  submission: { id, submitter, org, orgType, action, city, time, device,
                gpsOk, gps, hash, phash, width, height, size, mime, status,
                dup, forensics: { ela: { meanErr, highRatio, heatmap },
                                  exif: { hasExif, make, model, software,
                                          dateTime, dateTimeOriginal, gps },
                                  provenance: { c2pa, jumbf, xmp },
                                  locSource: 'exif-gps'|'demo', gpsKm } },
  verification: { score, subs: { auth, action, loc }, verdict,
                  flags: [{ code, level, msgKey, vars }] },
  receipt: { issuedAt }
}
```

If the real API is synchronous-ish (send → poll → result), the UI can stream the pipeline stages directly onto the same four stage rows; if it's asynchronous (webhook / long-poll), the stage animation waits for the server's events instead of local timers. Both fit the current `doSubmit()` structure without layout changes.

## Photo credits (attribution)

All demo photos are real photographs of climate actions, downloaded locally from **Wikimedia Commons** (public domain or CC-licensed, 800px thumbnails, stored in `assets/photos/`, re-fetchable via `node build/fetch-photos.js`). Full manifest: `build/photos-manifest.json`.

| File | Photo | Author | License |
|---|---|---|---|
| afforest-01 | Volunteers enjoy planting trees | Hillebrand Steve, U.S. Fish and Wildlife Service | Public domain |
| afforest-02 | Volunteer Tree Planting (120802-F-OS776-021) | Airman 1st Class Christopher Tam | Public domain |
| solar-01 | Rooftop solar panels in Caldicot | Jaggery (geograph.org.uk) | CC BY-SA 2.0 |
| solar-02 | Rooftop solar panels, Gwehelog | Jaggery (geograph.org.uk) | CC BY-SA 2.0 |
| wetland-01 | Wetland restoration in Australia | Nick carson | Public domain |
| wetland-02 | Wetland restoration, Wetlands Reserve Program Texas | USDA NRCS Texas | Public domain |
| ev-01 | Car2Go Charging Station Stuttgart | Julian Herzog | CC BY 4.0 |
| ev-02 | Pisa Enel X Charging Station | Daniele Napolitano | CC BY-SA 4.0 |
| cleanup-01 | Beaches cleanup volunteers | Olympic National Park | Public domain |
| cleanup-02 | Oregon beach cleanup volunteers | Ocean Blue Project | CC BY-SA 4.0 |
| retrofit-01 | Installing Insulation Batts (CSIRO ScienceImage 2175) | Tracey Nicholls, CSIRO | CC BY 3.0 |
| retrofit-02 | Installing Insulation & Roof Paneling | U.S. Navy / PO3 Matthew Noles | Public domain |

Source pages are linked in `build/photos-manifest.json`. Uploaded user photos (submit tab) are displayed via a locally generated 240px thumbnail; duplicate-group members render the base photo with a slight zoom + filter to simulate crop/filter re-uploads. The SVG scene generator (`js/photos.js`) remains as an offline fallback for submissions without a photo.

## Design system

- **White / light theme** (per team preference), status colors fixed to the accessible palette with icon+label pairing (color never carries meaning alone); categorical hues from a colorblind-safe validated palette (OKLab checks), single-hue ordinal ramps for rankings/histograms; thin 2px marks, 2px surface gaps, hover tooltips, legends, table views — per professional data-viz standards.
- Bilingual zh/en via a full i18n dictionary (`?lang=en`), deterministic SVG "photos" (no real images needed for the demo; duplicate members render as slightly zoomed/shifted variants of the original — visually convincing crop/filter re-uploads).
- Zero dependencies, pure-function data model (validated by `build/test-data.js`), `node --check` syntax gate, `window.__fatal` red banner instead of white screens, `?v=` cache busting on every asset.

## Deliberately out of scope

Real backend / API, authentication & reviewer roles, real photo upload (SVG stand-ins), real LLM behind the agent, persistence (state resets on reload).

## Roadmap

- **v0.3** — API mock layer (static JSON or local server), reviewer roles, real agent loop behind the agent (step streaming from an LLM with tool calls), dark mode variant.
- Later — cross-checking with satellite/registry data partners, mobile app submission flow, org-level admin views (org managers see only their submissions).

## File map

```
proof-api-dashboard/
  index.html           shell, boot guard, i18n entry
  css/style.css        white design system (tokens, components, responsive)
  js/data.js           pure data model: 66 submissions in 14 cities / 8 countries,
                       14 orgs, 2 action categories, dup groups, hierarchy rollups,
                       gap analysis, map stats (deterministic seed)
  js/map-data.js       embedded world map SVG paths (generated by build/build-map.js
                       from Natural Earth 50m, public domain; offline, no fetch)
  js/photos.js         deterministic SVG photo-scene generator
  js/i18n.js           zh/en dictionary, t()/lb()
  js/charts.js         zero-dep SVG chart engine (light ink, validated ramps)
  js/api.js            API boundary: submit payload/result + local verification engine
                       (real SHA-256 / pHash / noise / color, demo scoring; swap for real API)
  js/app.js            tabs, submit flow, queue + drawer, duplicates, analytics
                       (hierarchy + gaps), action map, evidence-check agent
  build/build-map.js   map build: ne50m.geojson → js/map-data.js (Douglas-Peucker
                       simplify 0.18°, y-flip, Antarctica dropped)
  build/test-data.js   dataset invariant checks (node) — includes map cross-check
```
