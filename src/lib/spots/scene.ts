/**
 * A SimScene is everything the sim needs for one place: the coast, the grid
 * placed on it, the bathymetry recipe and the named sections. Grid frame
 * choice is written up in FRAME-CHOICE.md.
 */
import type { BathyOverrides, GridSpec } from '../sim/bathy';
import { gridForCoast } from './frame';
import type { Coast } from './coasts';
import { isCustom, type Section, type Spot } from './spots';

export interface SimScene {
	/** changes whenever the domain changes; a new key means a new solver */
	key: string;
	name: string;
	/** ENU origin of the coast and sections */
	lat: number;
	lon: number;
	coast: Coast;
	grid: GridSpec;
	overrides: BathyOverrides;
	maxObliquityDeg?: number;
	sections: Section[];
	/** the placement could not keep 1 km of water in front of the core */
	squeezed: boolean;
	/** gridFromCoast's frame faced enclosed water and was replaced by the open-sea direction */
	guarded: boolean;
}

/** compass bearing the grid's offshore axis points to: a swell from here runs straight onshore */
export const offshoreBearing = (g: GridSpec) => (((90 - g.rotationDeg) % 360) + 360) % 360;

/** Domain size in metres: the J-Bay reference domain. */
export const DOMAIN = { across: 2400, along: 6400 };
/**
 * A clicked coast: shorter along shore, because the map's coastline query
 * covers about 2 km either side of the click.
 */
export const CLICK_DOMAIN = { across: 2400, along: 4000 };

/**
 * Cell size: 6.25 m (the sim line's recommended default) unless the device
 * looks small, then 12.5 m (a quarter of the cells). `?dx=` overrides.
 */
export function defaultDx(): number {
	try {
		const q = Number(new URLSearchParams(location.search).get('dx'));
		if (q === 6.25 || q === 12.5 || q === 25) return q;
		if (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 800) return 12.5;
	} catch {
		// no window (SSR or tests)
	}
	return 6.25;
}

export function buildScene(spot: Spot, coast: Coast, dx: number): SimScene {
	const d = isCustom(spot) ? CLICK_DOMAIN : DOMAIN;
	const nx = Math.round(d.across / dx);
	const ny = Math.round(d.along / dx);
	let grid: GridSpec;
	let squeezed = false;
	let guarded = false;
	const f = spot.frame;
	if (f?.origin && f.rotationDeg !== undefined) {
		// a hand-placed grid (J-Bay): corner of cell (0, 0) plus half a cell along both axes
		const r = (f.rotationDeg * Math.PI) / 180;
		const h = dx / 2;
		grid = {
			nx,
			ny,
			dx,
			origin: [f.origin[0] + h * Math.cos(r) - h * Math.sin(r), f.origin[1] + h * Math.sin(r) + h * Math.cos(r)],
			rotationDeg: f.rotationDeg
		};
	} else {
		const g = gridForCoast(coast.polylines, { dx, nx, ny, oceanSide: coast.oceanSide, rotationDeg: f?.rotationDeg });
		grid = g.grid;
		squeezed = g.info.squeezed;
		guarded = g.guarded;
	}
	return {
		key: `${spot.slug}@${spot.lat.toFixed(5)},${spot.lon.toFixed(5)}/${dx}`,
		name: spot.name,
		lat: spot.lat,
		lon: spot.lon,
		coast,
		grid,
		overrides: spot.recipe,
		maxObliquityDeg: f?.maxObliquityDeg,
		sections: spot.sections ?? [],
		squeezed,
		guarded
	};
}
