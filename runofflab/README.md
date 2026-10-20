# RunoffLab — Stormwater & Green Infrastructure Optimizer

RunoffLab models how rain gardens and permeable pavement change stormwater
runoff on developed sites. It does this with **EPA SWMM 5.2**, run locally
through PySWMM. Every reported number comes from a SWMM run; there are no
hand-tuned formulas. It needs no API keys, accounts, or internet connection
at runtime.

> **Status: Milestone 1 (foundation) complete.** The simulation backend, the
> constraint checks, the sample site and the HTTP API are built and tested.
> The web interface, optimizer, what-if comparison, saved projects and PDF
> reports are still to come (see the roadmap below).

## What works today

- **SWMM integration, verified.** SWMM 5.2.4 runs through PySWMM 2.2.0.
  A test checks the engine against a hand calculation (1 ha roof, 30 mm storm).
  Runoff equals rain minus depression storage to within 0.05 mm, and the
  peak flow matches the steady-state value.
- **Site model.** Roofs, parking, sidewalks and lawns are drawn as rectangles,
  draining to catch basins and a pipe network with an outfall.
- **Green infrastructure** as native SWMM LID controls:
  - rain gardens (`RG`), which capture runoff from an adjacent impervious
    surface;
  - permeable pavement (`PP`), with optional run-on.
- **Constraint enforcement.** Designs that break a rule are refused before
  SWMM runs: footprints outside their host surface, overlaps, the wrong host
  surface type, over-capture, loading ratios, budget, and available area.
- **Results.** Water balance (mm and m³), peak outfall discharge, node
  flooding and surcharge, per-LID water balance, and 5-minute time series
  for playback. Each result records the SWMM and PySWMM versions and the
  SHA-256 of the exact input file, so it can be reproduced.
- **Bundled sample site.** A fictional 2.4 ha campus block with a starter
  design.

### Sample result (reproducible: `pytest tests/test_engine.py`)

The sample site under a 50 mm, 24 h SCS Type II design storm on silt loam:

| | Baseline | Median rain garden + Lot B pavers |
|---|---:|---:|
| Runoff volume | 826 m³ | 576 m³ (−30 %) |
| Peak outfall discharge | 0.335 m³/s | 0.291 m³/s (−13 %) |
| Infiltration | 357 m³ | 503 m³ |
| Intervention area / cost | — | 1,360 m² / USD 240,000 (illustrative unit costs) |

These numbers come from a fictional site with illustrative unit costs. They
show what the tool does; they are not a claim about any real campus.

## Running the backend

```bash
cd runofflab/backend
uv venv .venv -p 3.12 && uv pip install -p .venv -e ".[dev]"   # or python -m venv + pip
.venv/bin/python -m pytest                                     # 28 tests, ~2 s
.venv/bin/uvicorn runofflab.api.app:app --reload               # http://localhost:8000/docs
```

`pyswmm` installs the SWMM engine as a prebuilt wheel, so there is nothing
else to download or compile.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Methodology & assumptions](docs/METHODOLOGY.md)

## Roadmap

1. ✅ **Foundation**: verify SWMM, build the domain model, INP generator,
   runner, validation and API, with tests.
2. **Core product**: Next.js workspace, SVG site editor, scenario settings,
   baseline vs proposed results, and SQLite projects.
3. **Standout features**: storm playback, the Design Explorer optimizer
   (Pareto front), and what-if analysis.
4. **Polish**: PDF reports, UX pass, and frontend tests.
5. **Portfolio**: screenshots, a demo script, and write-ups.
