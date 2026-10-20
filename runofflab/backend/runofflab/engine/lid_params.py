"""Fixed LID layer properties not exposed in the editor.

User-editable properties (depths, thicknesses) live on the intervention
models. The values here are typical figures from the LID Controls guidance in the SWMM 5 User's
Manual (Rossman 2015) and are listed in docs/METHODOLOGY.md so a reviewer can
see exactly what was assumed.
"""

# Rain garden ─ engineered soil media modelled as loamy sand (Rawls et al. 1983).
RG_VEGETATION_FRACTION = 0.1       # fraction of ponding volume occupied by plants
RG_SURFACE_ROUGHNESS = 0.1         # Manning's n of the planted surface
RG_SURFACE_SLOPE_PCT = 1.0
RG_SOIL_POROSITY = 0.437
RG_SOIL_FIELD_CAPACITY = 0.105
RG_SOIL_WILTING_POINT = 0.047
RG_SOIL_KSAT_MM_HR = 30.0
RG_SOIL_CONDUCTIVITY_SLOPE = 10.0  # manual: ~5 (sands) to ~15 (silty clays)
RG_SOIL_SUCTION_MM = 61.3
RG_GRAVEL_VOID_RATIO = 0.75        # void ratio (voids / solids), ≈ 43 % porosity

# Permeable pavement.
PP_SURFACE_ROUGHNESS = 0.012
PP_PAVEMENT_VOID_RATIO = 0.15      # manual: 0.12-0.21 for porous concrete/asphalt
PP_PAVEMENT_PERMEABILITY_MM_HR = 1000.0  # conservative vs. new pavement (100s of in/hr)
PP_STORAGE_VOID_RATIO = 0.75

# Initial LID saturation (%). Zero = LIDs start the storm empty.
INITIAL_SATURATION_PCT = 0
