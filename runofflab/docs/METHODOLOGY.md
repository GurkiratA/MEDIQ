# Methodology & assumptions

RunoffLab is a screening tool. It turns a simple site description into an
EPA SWMM 5.2 model, runs it, and reports what SWMM computes. The assumptions
below are applied the same way to the baseline and to every design. That
makes comparisons between them meaningful, even though absolute values
depend on parameters that should be calibrated for a real site.

## Rainfall
- **Design storms only.** RunoffLab does not include observed rainfall
  records or official return-period depths. The user picks a total depth and
  a temporal pattern:
  - **SCS Type II, 24 h**: cumulative table from USDA-SCS TR-55 (1986),
    linearly interpolated.
  - **Triangular**: Yen & Chow (1980), with an adjustable peak position.
  - **Uniform block.**
- The hyetograph uses 5-minute steps. Its total equals the chosen depth
  exactly, and a test checks this.
- To relate a depth to a return period, use local IDF data (for example,
  NOAA Atlas 14). Larger depths in what-if runs are hypothetical scenarios,
  not climate projections.

## Infiltration (native soil)
- SWMM's Green-Ampt method, using texture-class parameters from
  Rawls, Brakensiek & Miller (1983) as tabulated in the SWMM 5 User's Manual.
- The initial moisture deficit is porosity minus field capacity: the soil
  starts at field capacity.
- The *infiltration factor* scales native-soil Ksat and the LID seepage rate
  together. It is a sensitivity knob for compaction or clogging.

## Surfaces
- Roofs and pavement are 100 % impervious. Lawns and planted beds are 0 %.
- Manning's n and depression storage are typical values from the SWMM manual:
  - impervious: n 0.011–0.012, 1.5 mm storage;
  - lawn: n 0.15, 5 mm storage;
  - SWMM's default 25 % of impervious area has no depression storage.
- Sheet-flow width = area ÷ the rectangle's shorter side.

## Green infrastructure
- **Rain garden (SWMM `RG`).**
  - The user sets ponding depth, soil depth and gravel depth.
  - Engineered soil is modelled as loamy sand: porosity 0.437, field capacity
    0.105, wilting point 0.047, Ksat 30 mm/h, suction 61.3 mm.
  - Vegetation occupies 10 % of the ponding volume. Gravel void ratio is 0.75.
  - Water seeps into native soil at that soil's Ksat. There is no underdrain.
  - The garden captures a user-set area of one adjacent impervious surface.
    It is modelled in that surface's subcatchment via SWMM's
    "% impervious area treated", and its footprint area is moved there from
    the lawn so total site area is conserved.
- **Permeable pavement (SWMM `PP`).**
  - The user sets pavement thickness and storage depth.
  - Pavement void ratio is 0.15 and permeability 1000 mm/h, which is
    conservative compared with new pavement. Stone void ratio is 0.75.
  - Seepage happens at native Ksat. There is no underdrain and no clogging.
  - Optional run-on from the rest of the host surface.
- **LIDs start empty**, at 0 % initial saturation.
- **Constraints** (all user-editable):
  - contributing area ≤ 15 × rain-garden area;
  - pavement run-on ≤ 2 × its own area;
  - a contributing surface must be within 5 m of the garden's host surface.
- **Unit costs** (USD 250/m² for rain gardens, USD 150/m² for permeable
  pavement) are illustrative placeholders, not sourced quotes. Replace them
  with local figures.

## Drainage and simulation
- Dynamic-wave routing with a 5 s routing step (variable step 0.75).
- Inlets are SWMM junctions. Water that overflows a rim is counted as
  flooding and leaves the system (no surface ponding).
- Simulations run for the storm duration plus a 12 h drain period (editable).
  Water still held in LIDs at the end is reported as storage, not as runoff.
- Every result records:
  - SWMM runoff continuity error;
  - SWMM routing continuity error;
  - the SWMM and PySWMM versions;
  - the SHA-256 of the input file.

## Limitations
- The sample site is fictional: its geometry and elevations are illustrative.
- There is no calibration against observed flows. Results are for comparing
  options, not for design sign-off.
- Rectangular geometry. One soil type per site. No groundwater, water quality
  or long-term (continuous) simulation yet.

## References
- Rossman, L.A. (2015). *Storm Water Management Model User's Manual, Version 5.1.*
  EPA/600/R-14/413b.
- Rawls, W.J., Brakensiek, D.L. & Miller, N. (1983). Green-Ampt infiltration
  parameters from soils data. *J. Hydraulic Eng.* 109(1), 62–70.
- USDA-SCS (1986). *Urban Hydrology for Small Watersheds*, TR-55.
- Yen, B.C. & Chow, V.T. (1980). Design hyetographs for small drainage
  structures. *J. Hydraulics Div.* 106(6), 1055–1076.
- McDonnell, B. et al. (2020). PySWMM: The Python Interface to SWMM.
  *JOSS* 5(52), 2292.
