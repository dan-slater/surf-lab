/**
 * Coastlines for spots, in ENU metres about the spot's lat/lon.
 *
 * - J-Bay: the 72-vertex OpenStreetMap polyline in jbay.json (ocean on the
 *   right), the one the parity runs use.
 * - Other catalogue spots: `coasts/<slug>.json`, captured from OpenFreeMap
 *   vector tiles by `scripts/fetch-coasts.ts` through tiles.ts (ocean on the
 *   left, checked per polyline against the rendered map).
 * - A coast clicked on the map: kept in memory and localStorage under the
 *   custom spot's slug, so "cover this spot" survives a reload.
 */
import type { Polyline } from '../sim/bathy';
import { JBAY_COAST } from './jbay';
import type { Spot } from './spots';

export { JBAY_COAST };

export interface Coast {
	polylines: Polyline[];
	/** side of each polyline's direction of travel the ocean is on */
	oceanSide: 'left' | 'right';
	/** attribution */
	source: string;
}

/** The JSON written by scripts/fetch-coasts.ts */
export interface CoastFile extends Coast {
	slug: string;
	lat: number;
	lon: number;
	zoom: number;
	radiusMeters: number;
	fetched: string;
}

const files = import.meta.glob<CoastFile>('./coasts/*.json', { import: 'default' });
const memory = new Map<string, Coast>();
const storeKey = (slug: string) => `surflab:coast:${slug}`;

/** true when a coastline is bundled for this catalogue spot */
export function hasBundledCoast(spot: Spot): boolean {
	return spot.coastSource === 'jbay' || `./coasts/${spot.slug}.json` in files;
}

export async function loadCoast(spot: Spot): Promise<Coast | null> {
	if (spot.coastSource === 'jbay') return JBAY_COAST;
	const hit = memory.get(spot.slug);
	if (hit) return hit;
	const file = files[`./coasts/${spot.slug}.json`];
	if (file) {
		const c = await file();
		const coast = { polylines: c.polylines, oceanSide: c.oceanSide, source: c.source };
		memory.set(spot.slug, coast);
		return coast;
	}
	try {
		const raw = localStorage.getItem(storeKey(spot.slug));
		if (raw) {
			const coast = JSON.parse(raw) as Coast;
			memory.set(spot.slug, coast);
			return coast;
		}
	} catch {
		// storage unavailable or corrupt: fall through
	}
	return null;
}

/** Keep a coast for a spot (the custom "here" spot from a map click). */
export function putCoast(slug: string, coast: Coast): void {
	memory.set(slug, coast);
	try {
		localStorage.setItem(storeKey(slug), JSON.stringify(coast));
	} catch {
		// quota or private mode: memory only
	}
}
