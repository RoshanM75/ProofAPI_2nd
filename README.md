# Proof API — Verification Dashboard (Team P05)

**AI-powered climate-action verification · high-fidelity interactive prototype v0.1**

> 中文摘要:这是 Proof API 的可交互高保真初版——照片提交审核、AI 三模型验证评分、重复检测拦截、结果总览分析,外加证据核查智能体的证据核查流水线。纯前端零依赖,双击 index.html 即用,离线可演示,中英双语。

---

## Quick start

- **Open `index.html`** in any modern browser (double-click works, no server, no dependencies, works offline).
- Language: top-right toggle, or `index.html?lang=en`. Persisted in localStorage.
- Data self-check: `node build/test-data.js` (validates all dataset invariants).
- Debug URLs: `?tab=queue` jumps to a tab, `?drawer=PA-1082` opens a submission detail, `?agent=PA-1082` auto-runs an agent investigation, `?demo-submit=1` runs one scripted photo submission end-to-end, `?demo-submit=2` submits the same photo twice (second one gets flagged as an exact-hash duplicate).

## One clear flow — submit → result → flags → receipt

The first tab (**提交验证 / Submit**) is the end-to-end flow Sadaf asked for:

1. **Upload & claim** — drag-and-drop or file picker, live preview with file info (size / dimensions / type), claimed action type and location, optional submitter name. A **⚡ sample-photo button** generates a synthetic photo so the flow can be demoed with one click.
2. **AI verification** — animated pipeline: ingest & fingerprint → 3-model verification → duplicate detection → receipt. **Real client-side computation**: SHA-256 of the file, 64-bit perceptual hash (canvas 8×8), Laplacian noise variance (authenticity heuristic), HSV color-profile cosine similarity vs the claimed action (action-match heuristic). Geolocation consistency is a demo-model score until the real API supplies coordinates.
3. **Result & flags** — verdict banner (verified / pending / rejected / duplicate-flagged), composite score ring, sub-model bars, and a flags panel: `DUP_EXACT`, `DUP_PHASH`, `AUTH_SMOOTH`, `ACTION_MISMATCH`, `GEO_LOW` (or "✓ no flags"). Rule: **any flag blocks auto-approval** — duplicate → flagged, score < 60 → rejected, otherwise flags force human review.
4. **Receipt** — a printable verification receipt: submission ID, SHA-256 & pHash, claim details, pipeline checklist, model breakdown, and a status stamp. **🖨 Print** uses print CSS to output only the receipt.

Every submitted photo is registered into the live dataset: it appears in the Review Queue, updates the Overview KPIs, joins the Duplicates tab when flagged (submit the same file twice to see a real exact-hash interception, group G-06+), and can be handed to the evidence-check agent for an investigation. Session submissions persist in localStorage and survive reloads.

## What Proof API does

Citizens and field teams submit **photos as evidence of climate actions** (afforestation, rooftop solar, wetland restoration, EV charging, coastal cleanup, building retrofit). Every submission goes through an automated pipeline:

```
Mobile submission → Ingestion → 3-model verification → Duplicate detection → Agent evidence check → Publish result
```

The dashboard covers the four review dimensions from our brief — **photo submissions, verification scores, duplicate flags, results** — plus the evidence-check agent slot.

## Information architecture (5 modules)

| Module | Purpose | Key interactions |
|---|---|---|
| **Submit** | The end-to-end flow | Upload → animated verification → verdict + flags → printable receipt; one-click sample-photo demo; session submission history |
| **Overview** | Pipeline health & 14-day window | 5 KPIs, stacked daily volume by outcome, score histogram, action-type ranking, live feeds |
| **Review queue** | Core review workflow | Status/action filters, photo cards with composite ring + 3 sub-score bars, detail drawer, approve / reject (updates KPIs live), one-click dispatch to the agent |
| **Duplicates** | Duplicate groups & interception | 5 groups (exact hash / perceptual hash / crop-filter variants), side-by-side photo comparison with similarity meters & time gaps, confirm / mark-false-positive |
| **Analytics** | Model & human performance | Daily throughput, per-type deviation from global mean, sub-model means, score thresholds, auto-vs-human agreement |
| **Agent** | Evidence cross-check agent | Pipeline diagram with the agent slot, conversational agent that runs a 4-step investigation (metadata → forensics → geospatial → registry) and outputs a verdict with confidence and a citable evidence chain |

## Verification model (demo)

```
composite = authenticity × 40% + action-match × 35% + geolocation × 25%   (0–100)
```

- **≥ 85** auto-verified · **60–85** human review · **< 60** auto-rejected · any sub-model < 60 forces review
- Duplicate hits are flagged regardless of score (interception takes precedence).
- Demo dataset: 48 submissions (2026-10-31 → 11-13), deterministic seed — 9 today, 23 pending, 29.2% auto-approved, 14.6% duplicate interception, avg score 79.8. Auto-vs-human agreement 96.7%.

## Duplicate detection (3 channels, as shown in the demo)

1. **Exact hash** — identical file fingerprint, blocked outright (group G-01).
2. **Perceptual hash** (64-bit pHash) — Hamming distance < 8 after compression/crop/filter (G-02, G-03).
3. **Visual embeddings** — deep-model cosine similarity ≥ 0.85 enters a review group (G-04, G-05).

Blocking resubmissions directly prevents **double carbon-credit issuance**, the main financial risk the dedupe layer guards against.

## The evidence-check agent — how it complements the workflow

The agent sits **between duplicate detection and result publishing**. The models answer "does the photo match the claim?"; the agent answers *"should we believe this submission?"* by pulling external evidence:

1. **Read metadata** — EXIF, GPS, SHA-256, claimed location
2. **Image forensics** — ELA / noise-spectrum review for re-compression & manipulation
3. **Geospatial cross-check** — coordinates vs registered action grids (GeoRegistry)
4. **Registry comparison** — pHash index + climate-action registry lookup
5. **Verdict** — approve / reject / hold, with confidence % and a citable evidence chain

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
{ file: File, action: 'solar'|'wetland'|…, city: 0-8, submitter: 'name' }

// result
{
  ok: true,
  submission: { id, submitter, action, city, time, device, gpsOk,
                hash, phash, width, height, size, mime, status, dup },
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

## Deliberately out of scope for v0.1

Real backend / API, authentication & reviewer roles, real photo upload (SVG stand-ins), real LLM behind the agent, persistence (state resets on reload).

## Roadmap

- **v0.2** — API mock layer (static JSON or local server), file upload with client-side hash preview, reviewer roles, dark mode variant.
- **v0.3** — real agent loop behind the agent (step streaming from an LLM with tool calls), geospatial map view of submissions, per-organization analytics.
- Later — cross-checking with satellite/registry data partners, mobile app submission flow.

## File map

```
proof-api-dashboard/
  index.html           shell, boot guard, i18n entry
  css/style.css        white design system (tokens, components, responsive)
  js/data.js           pure data model: 48 submissions, dup groups, stats
  js/photos.js         deterministic SVG photo-scene generator
  js/i18n.js           zh/en dictionary, t()/lb()
  js/charts.js         zero-dep SVG chart engine (light ink, validated ramps)
  js/api.js            API boundary: submit payload/result + local verification engine
                       (real SHA-256 / pHash / noise / color, demo scoring; swap for real API)
  js/app.js            tabs, submit flow, queue + drawer, duplicates, analytics, evidence-check agent
  build/test-data.js   dataset invariant checks (node)
```
