/**
 * Frame budget for the solver: run as many solver steps per frame as fit in
 * `msPerFrame` of GPU time, and say when even that is not enough.
 *
 * Degrades in order: first fewer steps per frame than the requested speed
 * needs (the sea runs in slow motion: level 'slow-motion'), then, if a single
 * step plus the render still blows the budget or the sea runs at under half
 * speed for a sustained stretch, level 'coarser-grid': the caller should
 * rebuild the spot at a larger dx (coarserDx).
 */

export type BudgetLevel = 'ok' | 'slow-motion' | 'coarser-grid';

export interface BudgetOptions {
	/** fraction of the frame budget to plan for, leaving headroom (default 0.8) */
	headroom?: number;
	/** seconds of sustained trouble before asking for a coarser grid (default 3) */
	patience?: number;
	/** called once when the level changes */
	onLevel?: (level: BudgetLevel) => void;
}

/** The pure part: plans steps from measured costs. Testable without a GPU. */
export class Governor {
	/** smoothed GPU ms per solver step */
	msPerStep = 0.05;
	/** smoothed GPU ms per frame outside the solver (render, tracker) */
	msOther = 1;
	level: BudgetLevel = 'ok';
	/** model seconds owed and not yet stepped */
	private owed = 0;
	private wanted = 0;
	private got = 0;
	private trouble = 0;
	/** step cap from the frame interval (multiplicative decrease, additive increase) */
	private cap = 64;
	private lastSteps = 1;
	private readonly o: Required<Omit<BudgetOptions, 'onLevel'>> & Pick<BudgetOptions, 'onLevel'>;

	constructor(
		public budgetMs: number,
		private dt: number,
		opts: BudgetOptions = {}
	) {
		this.o = { headroom: 0.8, patience: 3, ...opts };
	}

	/** most steps that fit in one frame */
	get maxSteps(): number {
		const fromCost = Math.floor((this.budgetMs * this.o.headroom - this.msOther) / Math.max(this.msPerStep, 1e-4));
		return Math.max(1, Math.min(fromCost, Math.floor(this.cap)));
	}

	/**
	 * Steps to run this frame to advance `modelSeconds` (speed x real dt),
	 * capped by the budget. Shortfall is dropped, not carried: in slow motion
	 * the sea simply runs slower.
	 */
	plan(modelSeconds: number): number {
		this.owed += modelSeconds;
		const want = Math.floor(this.owed / this.dt);
		const n = Math.min(want, this.maxSteps);
		this.owed = want > n ? 0 : this.owed - n * this.dt;
		this.wanted += want;
		this.got += n;
		this.lastSteps = n;
		return n;
	}

	/**
	 * Feed a measurement: GPU ms for `steps` solver steps and for the whole
	 * frame (upper bounds are fine), and the real time since the last frame.
	 */
	observe(stepMs: number, steps: number, frameMs: number, realDt: number) {
		const k = 0.1;
		if (steps > 0 && stepMs > 0) this.msPerStep += k * (stepMs / steps - this.msPerStep);
		this.msOther += k * (Math.max(0, frameMs - stepMs) - this.msOther);
		// frames arriving late mean the machine is behind, whatever the timings
		// say: cut the step cap; otherwise let it grow back slowly
		const late = realDt * 1000 > this.budgetMs * 1.25 && realDt < 0.25;
		this.cap = late ? Math.max(1, Math.min(this.cap, this.lastSteps) * 0.7) : Math.min(64, this.cap + 0.05);
		// level: compare progress with what was asked over the recent past
		const ratio = this.wanted > 0 ? this.got / this.wanted : 1;
		const oneStepFrame = this.msOther + this.msPerStep;
		const bad = oneStepFrame > this.budgetMs || ratio < 0.5 || (late && this.lastSteps <= 1);
		this.trouble = bad ? this.trouble + realDt : Math.max(0, this.trouble - realDt);
		let next: BudgetLevel = ratio < 0.95 ? 'slow-motion' : 'ok';
		if (this.trouble > this.o.patience || this.level === 'coarser-grid') next = 'coarser-grid';
		if (next !== this.level) {
			this.level = next;
			this.o.onLevel?.(next);
		}
		// forget slowly so the ratio tracks the last few seconds
		this.wanted *= 0.97;
		this.got *= 0.97;
	}
}

/** The next grid size to fall back to: 6.25 -> 12.5 -> 25 m. */
export function coarserDx(dx: number): number {
	return dx * 2;
}
