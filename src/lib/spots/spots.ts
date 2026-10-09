/**
 * The spot catalogue: about twenty well-known breaks as plain facts, each with
 * bathymetry recipe overrides for `bathyFromPolyline` and an optional pinned
 * grid frame. Coastlines live separately (coasts.ts), so this module stays
 * small enough to import anywhere.
 */
import type { BathyOverrides, Vec2 } from '../sim/bathy';
import catalogue from './spots.json';
import { JBAY } from './jbay';

/** Compass directions are degrees the swell comes FROM (0 north, 90 east). */
export interface SwellWindow {
	/** the window runs clockwise from fromDeg to toDeg; it may wrap through north */
	fromDeg: number;
	toDeg: number;
}

export interface SpotSwell {
	/** significant wave height (m) */
	Hs: number;
	/** period (s) */
	Tp: number;
	/** deep-water compass direction the swell comes from (deg) */
	dirDeg: number;
}

export interface Section {
	name: string;
	/** ENU metres about the spot's lat/lon, when the position is known */
	x?: number;
	y?: number;
}

export interface SpotFrame {
	/** pin the grid rotation (deg, FRAME.md) instead of measuring it from the coast */
	rotationDeg?: number;
	/** cap on the wavemaker angle off the shore normal (deg), see generatorDirection */
	maxObliquityDeg?: number;
	/** pin the grid corner (ENU m, the outer corner of cell (0, 0)) instead of placing it */
	origin?: Vec2;
}

export interface Spot {
	slug: string;
	name: string;
	country: string;
	region: string;
	lat: number;
	lon: number;
	wave: {
		type: string;
		direction: 'left' | 'right' | 'both';
		bottom: string;
	};
	swellWindow: SwellWindow;
	/** a typical good swell, used before a forecast arrives */
	defaultSwell: SpotSwell;
	/** overrides on the J-Bay recipe (slope, shelf width, reef angle, sandbar) */
	recipe: BathyOverrides;
	frame?: SpotFrame;
	sections?: Section[];
	/** 'jbay' for the OSM polyline in jbay.json; otherwise coasts/<slug>.json from map tiles */
	coastSource?: 'jbay' | 'tiles';
}

export const spots: Spot[] = (catalogue as Spot[]).map((s) =>
	s.slug === 'jeffreys-bay' ? { ...s, sections: JBAY.sections } : s
);

export const defaultSpot: Spot = spots[0];

export function spotBySlug(slug: string): Spot | undefined {
	return spots.find((s) => s.slug === slug);
}

/** true when a compass direction lies inside the window (clockwise from -> to) */
export function inWindow(dirDeg: number, w: SwellWindow): boolean {
	const n = (a: number) => ((a % 360) + 360) % 360;
	const span = n(w.toDeg - w.fromDeg);
	return n(dirDeg - w.fromDeg) <= span;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 16-point compass name for a direction in degrees */
export function compassName(deg: number): string {
	return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * A spot made from a coast clicked on the map: not in the catalogue, its
 * coastline travels with it (coasts.ts stores it under the same slug).
 */
export function customSpot(lat: number, lon: number, name?: string): Spot {
	return {
		slug: 'here',
		name: name ?? `Coast at ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
		country: '',
		region: '',
		lat,
		lon,
		wave: { type: 'unknown', direction: 'both', bottom: 'unknown' },
		swellWindow: { fromDeg: 0, toDeg: 359.9 },
		defaultSwell: { Hs: 2, Tp: 13, dirDeg: 0 },
		recipe: {},
		coastSource: 'tiles'
	};
}

export const isCustom = (s: Spot) => s.slug === 'here';

const KEY = 'surflab:spot';

/** The spot the visitor last chose, or the default. Never throws. */
export function rememberedSpot(): Spot {
	try {
		const v = localStorage.getItem(KEY);
		if (!v) return defaultSpot;
		if (v.startsWith('{')) {
			const s = JSON.parse(v) as Spot;
			return typeof s.lat === 'number' && typeof s.lon === 'number' ? s : defaultSpot;
		}
		return spotBySlug(v) ?? defaultSpot;
	} catch {
		return defaultSpot;
	}
}

export function rememberSpot(spot: Spot): void {
	try {
		localStorage.setItem(KEY, isCustom(spot) ? JSON.stringify(spot) : spot.slug);
	} catch {
		// private mode or storage disabled: nothing to remember
	}
}
