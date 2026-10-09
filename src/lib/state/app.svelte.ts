/**
 * The app's one shared store (Svelte 5 runes). The cover, the dial, the map,
 * the spot pages and (later) the book's instruments all read and write it.
 * Shape and rules: README.md in this directory.
 */
import { defaultSpot, rememberSpot, rememberedSpot, type Spot, type SpotSwell } from '../spots/spots';

export type SwellSource = 'dial' | 'today' | 'spot-default';

export interface AppState {
	/** the spot on screen: a catalogue spot or a coast clicked on the map (slug 'here') */
	spot: Spot;
	/** deep-water swell: Hs (m), Tp (s), dirDeg (compass FROM, deg). The sim refracts it to its wavemaker */
	swell: SpotSwell;
	/** where the swell numbers came from */
	source: SwellSource;
	/** dial and controls showing (the cover hides them when idle) */
	chrome: boolean;
}

export const app: AppState = $state({
	spot: defaultSpot,
	swell: { ...defaultSpot.defaultSwell },
	source: 'spot-default',
	chrome: false
});

/** Load the remembered spot (call once in the browser, from onMount). */
export function restore(): void {
	const s = rememberedSpot();
	if (s.slug !== app.spot.slug || s.lat !== app.spot.lat) setSpot(s);
}

/** Switch spot; the swell resets to the spot's default until a forecast or the dial changes it. */
export function setSpot(spot: Spot, opts: { remember?: boolean } = {}): void {
	app.spot = spot;
	app.swell = { ...spot.defaultSwell };
	app.source = 'spot-default';
	if (opts.remember ?? true) rememberSpot(spot);
}

export function setSwell(swell: Partial<SpotSwell>, source: SwellSource): void {
	app.swell = { ...app.swell, ...swell };
	app.source = source;
}

export function setChrome(on: boolean): void {
	app.chrome = on;
}
