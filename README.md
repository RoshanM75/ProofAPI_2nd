# Proof API — Verification Dashboard (Team P05)

**AI-powered climate-action verification · high-fidelity interactive prototype v0.1**

> 中文摘要:这是 Proof API 的可交互高保真初版——照片提交审核、AI 三模型验证评分、重复检测拦截、结果总览分析,外加 SNOOP 气候智能体的证据核查流水线。纯前端零依赖,双击 index.html 即用,离线可演示,中英双语。

---

## Quick start

- **Open `index.html`** in any modern browser (double-click works, no server, no dependencies, works offline).
- Language: top-right toggle, or `index.html?lang=en`. Persisted in localStorage.
- Data self-check: `node build/test-data.js` (validates all dataset invariants).
- Debug URLs: `?tab=queue` jumps to a tab, `?drawer=PA-1082` opens a submission detail, `?snoop=PA-1082` auto-runs a SNOOP investigation (also useful for screenshots).

## What Proof API does

Citizens and field teams submit **photos as evidence of climate actions** (afforestation, rooftop solar, wetland restoration, EV charging, coastal cleanup, building retrofit). Every submission goes through an automated pipeline:

```
Mobile submission → Ingestion → 3-model verification → Duplicate detection → SNOOP evidence check → Publish result
```

The dashboard covers the four review dimensions from our brief — **photo submissions, verification scores, duplicate flags, results** — plus the SNOOP agent slot.

## Information architecture (5 modules)

| Module | Purpose | Key interactions |
|---|---|---|
| **Overview** | Pipeline health & 14-day window | 5 KPIs, stacked daily volume by outcome, score histogram, action-type ranking, live feeds |
| **Review queue** | Core review workflow | Status/action filters, photo cards with composite ring + 3 sub-score bars, detail drawer, approve / reject (updates KPIs live), one-click dispatch to SNOOP |
| **Duplicates** | Duplicate groups & interception | 5 groups (exact hash / perceptual hash / crop-filter variants), side-by-side photo comparison with similarity meters & time gaps, confirm / mark-false-positive |
| **Analytics** | Model & human performance | Daily throughput, per-type deviation from global mean, sub-model means, score thresholds, auto-vs-human agreement |
| **SNOOP agent** | Evidence cross-check agent | Pipeline diagram with the SNOOP slot, conversational agent that runs a 4-step investigation (metadata → forensics → geospatial → registry) and outputs a verdict with confidence and a citable evidence chain |

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

## SNOOP — how it complements the workflow

SNOOP sits **between duplicate detection and result publishing**. The models answer "does the photo match the claim?"; SNOOP answers *"should we believe this submission?"* by pulling external evidence:

1. **Read metadata** — EXIF, GPS, SHA-256, claimed location
2. **Image forensics** — ELA / noise-spectrum review for re-compression & manipulation
3. **Geospatial cross-check** — coordinates vs registered action grids (GeoRegistry)
4. **Registry comparison** — pHash index + climate-action registry lookup
5. **Verdict** — approve / reject / hold, with confidence % and a citable evidence chain

In the prototype SNOOP is a deterministic rules engine wired to live dashboard state (same architecture as our ClimateOS assistant), so the full agent loop is demonstrable offline. It can be invoked from any submission detail panel ("Send to SNOOP"), which deep-links into the agent tab and runs the investigation. The UI is deliberately structured as *step bubbles + tool-call chips + evidence*, which maps 1:1 onto a real agent trace later.

**Sketch of the real API contract (v0.2+)** — the UI is already organized around these boundaries:

```
POST   /submissions               photo + claim + geotag
GET    /submissions/:id           composite + sub-scores + status
GET    /submissions/:id/verdict   SNOOP investigation & evidence chain
GET    /duplicates?sim>=0.85      groups, similarity, originals
POST   /duplicates/:group/confirm | /dismiss
GET    /agents/snoop/investigate/:id   (streamed step events)
```

## Design system

- **White / light theme** (per team preference), status colors fixed to the accessible palette with icon+label pairing (color never carries meaning alone); categorical hues from a colorblind-safe validated palette (OKLab checks), single-hue ordinal ramps for rankings/histograms; thin 2px marks, 2px surface gaps, hover tooltips, legends, table views — per professional data-viz standards.
- Bilingual zh/en via a full i18n dictionary (`?lang=en`), deterministic SVG "photos" (no real images needed for the demo; duplicate members render as slightly zoomed/shifted variants of the original — visually convincing crop/filter re-uploads).
- Zero dependencies, pure-function data model (validated by `build/test-data.js`), `node --check` syntax gate, `window.__fatal` red banner instead of white screens, `?v=` cache busting on every asset.

## Deliberately out of scope for v0.1

Real backend / API, authentication & reviewer roles, real photo upload (SVG stand-ins), real LLM behind SNOOP, persistence (state resets on reload).

## Roadmap

- **v0.2** — API mock layer (static JSON or local server), file upload with client-side hash preview, reviewer roles, dark mode variant.
- **v0.3** — real agent loop behind SNOOP (step streaming from an LLM with tool calls), geospatial map view of submissions, per-organization analytics.
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
  js/app.js            tabs, queue + drawer, duplicates, analytics, SNOOP agent
  build/test-data.js   dataset invariant checks (node)
```
