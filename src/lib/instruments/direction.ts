// Deep-water swell direction (what the book and the app store carry) to the
// direction the solver's wavemaker needs.
//
// The sim line is adding `generatorDirection(deepWaterDeg, grid, depth)` to
// src/lib/sim/swell.ts. Until it lands this stand-in applies the one pair we
// have measured: Run A forces J-Bay from 120° locally for the regional 225°
// SW swell (see src/lib/sim/FRAME.md), a 105° turn around Cape St Francis.
// It is J-Bay only and assumes that turn holds across the swell window.
//
// Switch: replace the body with `return generatorDirection(deepWaterDeg, grid, depth);`

import type { GridSpec } from '#lib/sim/bathy.ts';

const JBAY_DEEP = 225;
const JBAY_LOCAL = 120;

export function generatorDirectionFor(deepWaterDeg: number, _grid: GridSpec, _depth: Float32Array): number {
	return (((deepWaterDeg - (JBAY_DEEP - JBAY_LOCAL)) % 360) + 360) % 360;
}
