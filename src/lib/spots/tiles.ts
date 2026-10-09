/**
 * Coastlines from the map's vector tiles, with each polyline's water side
 * checked against the rendered water layer.
 *
 * map-kit v0.1.0's coastlineNear documents water on the left. Measured against
 * the rendered map on 2026-10-09 it is the other way round almost everywhere:
 * at 18 of the 19 catalogue coasts and at Durban, the water was on the right.
 * So every polyline is probed: points either side of several of its segments
 * are tested with queryRenderedFeatures, and the polyline is reversed when the
 * votes say the water is on the right. A polyline that cannot be probed (off
 * screen, or both sides alike) follows the majority of the ones that could,
 * and is reversed when none could, which is the measured behaviour.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';
import { coastlineNear, distanceMeters } from '@dan-slater/map-kit';
import type { Polyline } from '../sim/bathy';
import type { Coast } from './coasts';

const OFFSET_PX = 4;
const PROBES = 11;

function isWater(map: MapLibreMap, lon: number, lat: number): boolean | null {
	const p = map.project([lon, lat]);
	const c = map.getCanvas();
	const w = c.clientWidth, h = c.clientHeight;
	if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return null;
	const feats = map.queryRenderedFeatures([p.x, p.y]);
	return feats.some((f) => f.sourceLayer === 'water' && (f.properties?.class ?? 'ocean') === 'ocean');
}

/** +1 water on the left, -1 on the right, 0 undecided */
function waterSide(map: MapLibreMap, line: Polyline, toLonLat: (x: number, y: number) => [number, number], off: number): number {
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
		const left = isWater(map, ...toLonLat(mx + off * lx, my + off * ly));
		const right = isWater(map, ...toLonLat(mx - off * lx, my - off * ly));
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
	// a few pixels either side, so the probe clears the rendered line at any zoom
	const c = map.getCenter();
	const p0 = map.project(c);
	const mpp = distanceMeters(c.lng, c.lat, map.unproject([p0.x + 100, p0.y]).lng, c.lat) / 100;
	const off = Math.max(8, OFFSET_PX * mpp);
	const lines = res.polylines.map((p) => p.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number]));
	const sides = lines.map((l) => waterSide(map, l, toLonLat, off));
	const majority = Math.sign(sides.reduce((a, b) => a + b, 0)) || -1;
	let flipped = 0, unchecked = 0;
	const polylines = lines.map((line, i) => {
		const side = sides[i] || majority;
		if (sides[i] === 0) unchecked++;
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
