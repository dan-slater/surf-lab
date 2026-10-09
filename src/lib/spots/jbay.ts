import type { GridSpec, Polyline } from '../sim/bathy';
import spot from './jbay.json';

/**
 * Jeffreys Bay, the reference spot. Coastline: OpenStreetMap (ODbL), 72
 * vertices in ENU metres, origin at Supertubes (lat/lon in `origin`).
 */
export const JBAY = spot as {
	id: string;
	name: string;
	origin: { lat: number; lon: number; note: string };
	coast: Polyline;
	sections: { name: string; x: number; y: number }[];
	source: string;
};

/**
 * The Run C grid: 192 x 512 cells at 12.5 m, the 5 x 5 block average of the
 * Run A grid (960 x 2560 at 2.5 m, first cell centre at (-998.75, -2898.75)).
 * The coarse cell centre is the mean of its 25 fine centres.
 */
export const JBAY_GRID: GridSpec = {
	nx: 192,
	ny: 512,
	dx: 12.5,
	origin: [-998.75 + 2 * 2.5, -2898.75 + 2 * 2.5],
	rotationDeg: 0
};

/**
 * Run A forcing (out/A4-full/manifest.json): directional JONSWAP Hs 2.5 m,
 * Tp 15 s, gamma 3.3, cos^20 spread about theta0 = 150 deg (math frame, from
 * +x). In compass terms the swell arrives FROM 270 - 150 = 120 deg.
 */
export const JBAY_RUN_A_SWELL = { Hs: 2.5, Tp: 15, dirDeg: 120, spread: 20, gamma: 3.3, seed: 1234 };
