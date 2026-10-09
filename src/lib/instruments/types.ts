import type { JBAY } from '#lib/spots/jbay.ts';

/** A spot as the instruments need it: an ENU coastline (ocean on the right) and named sections. */
export type InstrumentSpot = Pick<typeof JBAY, 'name' | 'coast' | 'sections'> & {
	/** Compass swell window [from, to] in degrees, clockwise, if known. */
	window?: [number, number];
};

/**
 * The props every instrument accepts. Hs and Tp are the offshore significant
 * height and peak period; dirDeg is the compass direction the swell comes FROM.
 */
export interface SwellProps {
	Hs?: number;
	Tp?: number;
	dirDeg?: number;
	spot?: InstrumentSpot;
}

/** J-Bay on a good day: the book's default swell. */
export const DEFAULT_SWELL = { Hs: 2.5, Tp: 15, dirDeg: 225 } as const;
