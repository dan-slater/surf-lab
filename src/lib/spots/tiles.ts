/**
 * Coastlines from the map's vector tiles, with each polyline's water side
 * checked against the rendered water layer.
 *
 * map-kit's coastlineNear promises water on the left, and that holds where the
 * coast is a polygon's outer ring. Where the land is a hole in a water polygon
 * the ring runs the other way and the water is on the right (Durban beach,
 * 2026-10-09). So every polyline is probed: points a few metres either side
 * of several of its segments are tested with queryRenderedFeatures, and the
 * polyline is reversed when the votes say the water is on the right.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';
import { coastlineNear } from '@dan-slater/map-kit';
import type { Polyline } from '../sim/bathy';
import type { Coast } from './coasts';

const OFFSET_M = 12;
const PROBES = 9;

function isWater(map: MapLibreMap, lon: number, lat: number): boolean | null {
	const p = map.project([lon, lat]);
	const c = map.getCanvas();
	const w = c.clientWidth, h = c.clientHeight;
	if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return null;
	const feats = map.queryRenderedFeatures([p.x, p.y]);
	return feats.some((f) => f.sourceLayer === 'water' && (f.properties?.class ?? 'ocean') === 'ocean');
}

/** +1 water on the left, -1 on the right, 0 undecided */
function waterSide(map: MapLibreMap, line: Polyline, toLonLat: (x: number, y: number) => [number, number]): number {
	let vote = 0;
	const n = line.length - 1;
	for (let k = 0; k < PROBES; k++) {
		const i = Math.min(n - 1, Math.floor(((k + 0.5) / PROBES) * n));
		const [ax, ay] = line[i], [bx, by] = line[i + 1];
		const len = Math.hypot(bx - ax, by - ay);
		if (len < 1) continue;
		const mx = (ax + bx) / 2, my = (ay + by) / 2;
		// left normal of the direction of travel
		const lx = -(by - ay) / len, ly = (bx - ax) / len;
		const left = isWater(map, ...toLonLat(mx + OFFSET_M * lx, my + OFFSET_M * ly));
		const right = isWater(map, ...toLonLat(mx - OFFSET_M * lx, my - OFFSET_M * ly));
		if (left === null || right === null || left === right) continue;
		vote += left ? 1 : -1;
	}
	return Math.sign(vote);
}

export interface TileCoast extends Coast {
	/** polylines reversed because their water turned out to be on the right */
	flipped: number;
	/** polylines whose side could not be checked (off screen or ambiguous), kept as given */
	unchecked: number;
}

/** The ocean coast within `radius` of a point, water on the left of every polyline. */
export async function tileCoast(map: MapLibreMap, lon: number, lat: number, radius = 2000): Promise<TileCoast | null> {
	const res = await coastlineNear(map, { lon, lat, radiusMeters: radius, classes: ['ocean'], minLengthMeters: 100 });
	if (!res.polylines.length) return null;
	const toLonLat = (x: number, y: number) => res.frame.toLonLat(x, y) as [number, number];
	let flipped = 0, unchecked = 0;
	const polylines = res.polylines.map((p) => {
		const line = p.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]);
		const side = waterSide(map, line, toLonLat);
		if (side === 0) unchecked++;
		if (side < 0) {
			flipped++;
			line.reverse();
		}
		return line;
	});
	return {
		polylines,
		oceanSide: 'left',
		source: 'OpenStreetMap contributors (ODbL) via OpenFreeMap vector tiles',
		flipped,
		unchecked
	};
}
