/** Load a spot's coast and place the sim grid on it. */
import { loadCoast } from './coasts';
import { buildScene, type SimScene } from './scene';
import type { Spot } from './spots';

export type SceneResult = { scene: SimScene; error?: undefined } | { scene: null; error: string };

export async function loadScene(spot: Spot, dx: number): Promise<SceneResult> {
	const coast = await loadCoast(spot);
	if (!coast || coast.polylines.length === 0) {
		return { scene: null, error: `No coastline is bundled for ${spot.name} yet. Open it on the map to model it from the tiles.` };
	}
	try {
		return { scene: buildScene(spot, coast, dx) };
	} catch (e) {
		return { scene: null, error: e instanceof Error ? e.message : String(e) };
	}
}
