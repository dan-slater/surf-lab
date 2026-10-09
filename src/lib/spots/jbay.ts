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
 * The same 2.4 x 6.4 km domain at another cell size (dx must divide 2400 and
 * 6400). jbayGrid(12.5) is JBAY_GRID; jbayGrid(2.5) is Run A's grid.
 */
export function jbayGrid(dx: number): GridSpec {
	return { nx: Math.round(2400 / dx), ny: Math.round(6400 / dx), dx, origin: [-1000 + dx / 2, -2900 + dx / 2], rotationDeg: 0 };
}

/**
 * Run A forcing (out/A4-full/manifest.json): directional JONSWAP Hs 2.5 m,
 * Tp 15 s, gamma 3.3, cos^20 spread about theta0 = 150 deg (math frame, from
 * +x). In compass terms the swell arrives FROM 270 - 150 = 120 deg.
 */
export const JBAY_RUN_A_SWELL = { Hs: 2.5, Tp: 15, dirDeg: 120, spread: 20, gamma: 3.3, seed: 1234 };

/** J-Bay's coast in the shape src/lib/spots/coasts.ts uses (OSM convention: ocean on the right). */
export const JBAY_COAST = { polylines: [JBAY.coast], oceanSide: 'right' as const, source: JBAY.source };
