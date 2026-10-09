// The book's instruments and which one sits beside which section.
//
// Every instrument takes the swell props { Hs, Tp, dirDeg, spot? } (see
// types.ts) plus optional extras from its chapter's worked numbers, listed in
// `props` below. A section maps to zero or more entries: the first is shown
// beside the text, the rest are offered as tabs. An empty list keeps whatever
// the reader was looking at.

import type { Component } from 'svelte';
import P1Dispersion from './P1Dispersion.svelte';
import P2Snell from './P2Snell.svelte';
import P3Rays from './P3Rays.svelte';
import P4Peel from './P4Peel.svelte';
import P5Nswe from './P5Nswe.svelte';
import P6Rig from './P6Rig.svelte';
import SwellArrival from './SwellArrival.svelte';
import SwellPower from './SwellPower.svelte';
import Iribarren from './Iribarren.svelte';
import Sim2D from './Sim2D.svelte';
import CatchGap from './CatchGap.svelte';
import Refraction from './Refraction.svelte';
import Tide from './Tide.svelte';
import RipPulse from './RipPulse.svelte';
import HeightStats from './HeightStats.svelte';
import EffectiveFlow from './EffectiveFlow.svelte';
import SectionSpeed from './SectionSpeed.svelte';
import FaceAccel from './FaceAccel.svelte';
import BankedTurn from './BankedTurn.svelte';
import BoardPlaning from './BoardPlaning.svelte';
import FinLift from './FinLift.svelte';

export { DEFAULT_SWELL, type SwellProps, type InstrumentSpot } from './types';
export {
	P1Dispersion,
	P2Snell,
	P3Rays,
	P4Peel,
	P5Nswe,
	P6Rig,
	SwellArrival,
	SwellPower,
	Iribarren,
	Sim2D,
	CatchGap,
	Refraction,
	Tide,
	RipPulse,
	HeightStats,
	EffectiveFlow,
	SectionSpeed,
	FaceAccel,
	BankedTurn,
	BoardPlaning,
	FinLift
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = Component<any>;

export interface InstrumentDef {
	id: string;
	/** Short name for tabs and pickers. */
	name: string;
	component: AnyComponent;
	/** True for the six lifted from the research notes. */
	lifted: boolean;
}

export const INSTRUMENTS = {
	P1: { id: 'P1', name: 'P1 dispersion and shoaling', component: P1Dispersion, lifted: true },
	P2: { id: 'P2', name: 'P2 refraction and break depth', component: P2Snell, lifted: true },
	P3: { id: 'P3', name: 'P3 rays over J-Bay', component: P3Rays, lifted: true },
	P4: { id: 'P4', name: 'P4 peel angle', component: P4Peel, lifted: true },
	P5: { id: 'P5', name: 'P5 live 1-D surf zone', component: P5Nswe, lifted: true },
	P6: { id: 'P6', name: 'P6 surfer rig', component: P6Rig, lifted: true },
	arrival: { id: 'arrival', name: 'Distance sorting and sets', component: SwellArrival, lifted: false },
	power: { id: 'power', name: 'Wave power and reach', component: SwellPower, lifted: false },
	iribarren: { id: 'iribarren', name: 'Iribarren number', component: Iribarren, lifted: false },
	sim: { id: 'sim', name: '2-D simulation', component: Sim2D, lifted: false },
	catch: { id: 'catch', name: 'The catching gap', component: CatchGap, lifted: false },
	refraction: { id: 'refraction', name: 'Direction and refraction', component: Refraction, lifted: false },
	tide: { id: 'tide', name: 'Tide walks the break', component: Tide, lifted: false },
	rip: { id: 'rip', name: 'Rip pulses', component: RipPulse, lifted: false },
	heights: { id: 'heights', name: 'Height statistics', component: HeightStats, lifted: false },
	flow: { id: 'flow', name: 'The flow you ride', component: EffectiveFlow, lifted: false },
	section: { id: 'section', name: 'Section speed', component: SectionSpeed, lifted: false },
	accel: { id: 'accel', name: 'Face acceleration', component: FaceAccel, lifted: false },
	turn: { id: 'turn', name: 'Banked turn', component: BankedTurn, lifted: false },
	board: { id: 'board', name: 'Paddling and planing', component: BoardPlaning, lifted: false },
	fin: { id: 'fin', name: 'Fin lift', component: FinLift, lifted: false }
} satisfies Record<string, InstrumentDef>;

export type InstrumentId = keyof typeof INSTRUMENTS;

export interface InstrumentEntry {
	id: InstrumentId;
	/** One line shown under the instrument's tab. */
	caption: string;
	/** Extra props from the chapter's worked numbers (beyond the swell props). */
	props?: Record<string, unknown>;
}

const e = (id: InstrumentId, caption: string, props?: Record<string, unknown>): InstrumentEntry => ({ id, caption, props });

/** chapter slug → per-section instrument lists, in section order */
const MAP: Record<string, InstrumentEntry[][]> = {
	swell: [
		[e('arrival', 'A storm makes a spectrum; the crossing sorts it by period.', { bandwidth: 10 })],
		[e('P1', 'Speed is linear in period, wavelength goes as period squared.', { depth: 60 })],
		[e('P1', 'In deep water the group speed is half the crest speed; in shallow water they meet.', { depth: 60 })],
		[e('arrival', 'Long periods arrive first; a narrow band beats into sets.')],
		[e('power', 'Power goes as height squared; reach goes as period squared.')]
	],
	breaking: [
		[e('P1', 'As the wave slows, height must rise: shoaling.', { depth: 4 })],
		[e('P3', 'Rays bend toward the shallows and converge on the point.'), e('sim', 'The 2-D solver on the same coastline.')],
		[e('P2', 'The wave breaks where its height reaches 0.78 of the depth.')],
		[e('iribarren', 'Slope over steepness predicts spilling, plunging or surging.', { slope: 1 / 30 }), e('P2', 'The same Iribarren number at the break point.')],
		[e('P4', 'The peel angle sets the speed you need to hold the face.', { peel: 45 })]
	],
	catching: [
		[e('P5', 'Unbroken swell moves energy; the bore past the lip moves water.')],
		[e('catch', 'The wave arrives at 5 to 6 m/s; your best sprint is under 2.')],
		[e('catch', 'Gravity along the tilted face closes the gap, not your arms.')],
		[e('board', 'Length and volume move the paddling ceiling, fitness barely does.', { lengthFt: 6 })],
		[e('P5', 'The bore carries the moving mass you dive under.')]
	],
	day: [
		[e('refraction', 'Crests swing toward the contours; height follows the ray spacing.', { angle: 30 })],
		[e('tide', 'The tide moves the break onto a different slope.')],
		[],
		[e('rip', 'A steady rip plus surges on the wave-group beat.')],
		[e('heights', 'Hs is not a ceiling: 13.5% of waves beat it.', { hours: 3, depth: 2.5 })]
	],
	riding: [
		[e('flow', 'In the wave frame the water streams up the face, fastest at the base.')],
		[e('section', 'A narrow peel angle asks for one and a half to two times the wave speed.', { peel: 40 })],
		[e('accel', 'Reduced gravity peaks at g/2 on a 45° face.', { angle: 45 })],
		[e('accel', 'The advancing face does work on you even in trim.', { angle: 30 }), e('P6', 'The rig on the peel front.', { onPeel: true, pose: 2 })],
		[e('section', 'The ceiling is about twice the wave speed; nothing under 30° is makeable.', { peel: 30 }), e('P6', 'The rig on the peel front.', { onPeel: true, pose: 2 })]
	],
	turns: [
		[e('turn', 'Speed and lean set the radius; lean sets how heavy you feel.', { lean: 45 })],
		[e('P6', 'Pumping: load the rail at the bottom of each arc.', { onPeel: true, play: true }), e('section', 'The peel angle is the floor your speed must clear.')],
		[e('turn', 'A harder lean spends less wave.', { lean: 60, turn: 90 })],
		[e('turn', 'A top turn reverses most of your velocity.', { lean: 60, turn: 150, speed: 8 }), e('P6', 'The rig through the top turn.', { pose: 4, onPeel: true })]
	],
	board: [
		[e('board', 'Displacement while you paddle, planing once you ride.')],
		[e('board', 'A fixed load wets less as you go faster.')],
		[],
		[]
	],
	fins: [
		[e('fin', 'A fin is a hydrofoil: lift at an angle of attack, paid for in drag.')],
		[e('fin', 'Lift rises nearly linearly until the flow separates.')],
		[e('fin', 'Hold at a given angle falls with the square of speed.', { speed: 4 })],
		[],
		[]
	],
	teaching: []
};

/** The instruments for one section of a chapter (empty when the section is text only). */
export function instrumentFor(chapterSlug: string, sectionIndex: number): InstrumentEntry[] {
	return MAP[chapterSlug]?.[sectionIndex] ?? [];
}

/** Every distinct instrument a chapter uses, in first-use order, for the manual picker. */
export function instrumentsInChapter(chapterSlug: string): InstrumentEntry[] {
	const seen = new Set<string>();
	const out: InstrumentEntry[] = [];
	for (const list of MAP[chapterSlug] ?? []) for (const entry of list) if (!seen.has(entry.id)) (seen.add(entry.id), out.push(entry));
	return out;
}

/**
 * The swell each chapter opens with: J-Bay on a good day, except where a
 * chapter's worked examples share one swell of their own.
 */
export const CHAPTER_SWELL: Record<string, { Hs: number; Tp: number; dirDeg: number }> = {
	day: { Hs: 1.5, Tp: 14, dirDeg: 225 }
};
