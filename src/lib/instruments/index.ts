// The book's instruments and which one sits beside which section.
//
// Every instrument takes the swell props { Hs, Tp, dirDeg, spot? } (see
// types.ts) plus optional extras from its chapter's worked numbers, listed in
// `props` below. A section maps to zero or more entries: the first is shown
// beside the text, the rest are offered as tabs. An empty list keeps whatever
// the reader was looking at.

import type { Component } from 'svelte';
import type { InstrumentId } from './map';
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
} satisfies Record<InstrumentId, InstrumentDef>;

export {
	instrumentFor,
	instrumentsInChapter,
	CHAPTER_SWELL,
	type InstrumentEntry,
	type InstrumentId
} from './map';
