// Minimal chart drawing for the derived instruments: a box, linear axes with
// ticks, a polyline from a function, labels. Logical canvas units.

import type { Palette } from './palette';

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}
export interface Axes {
	box: Box;
	X: (v: number) => number;
	Y: (v: number) => number;
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

export function axes(
	ctx: CanvasRenderingContext2D,
	COL: Palette,
	box: Box,
	[x0, x1]: [number, number],
	[y0, y1]: [number, number],
	o: { xTicks?: number[]; yTicks?: number[]; xLabel?: string; yLabel?: string; xFmt?: (v: number) => string; yFmt?: (v: number) => string } = {}
): Axes {
	const X = (v: number) => box.x + ((v - x0) / (x1 - x0)) * box.w;
	const Y = (v: number) => box.y + box.h - ((v - y0) / (y1 - y0)) * box.h;
	ctx.save();
	ctx.strokeStyle = COL.grid;
	ctx.lineWidth = 1;
	ctx.font = COL.font(10);
	ctx.fillStyle = COL.muted;
	ctx.textAlign = 'center';
	for (const v of o.xTicks ?? []) {
		ctx.beginPath();
		ctx.moveTo(X(v), box.y);
		ctx.lineTo(X(v), box.y + box.h);
		ctx.stroke();
		ctx.fillText((o.xFmt ?? String)(v), X(v), box.y + box.h + 14);
	}
	ctx.textAlign = 'right';
	for (const v of o.yTicks ?? []) {
		ctx.beginPath();
		ctx.moveTo(box.x, Y(v));
		ctx.lineTo(box.x + box.w, Y(v));
		ctx.stroke();
		ctx.fillText((o.yFmt ?? String)(v), box.x - 6, Y(v) + 3);
	}
	ctx.textAlign = 'center';
	if (o.xLabel) ctx.fillText(o.xLabel, box.x + box.w / 2, box.y + box.h + 30);
	if (o.yLabel) {
		ctx.translate(box.x - 40, box.y + box.h / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText(o.yLabel, 0, 0);
	}
	ctx.restore();
	return { box, X, Y, x0, x1, y0, y1 };
}

/** Plot y = fn(x) over the axes' x range, clipped to the box. */
export function curve(
	ctx: CanvasRenderingContext2D,
	a: Axes,
	fn: (x: number) => number,
	style: string,
	width = 1.6,
	dash: number[] = [],
	range: [number, number] = [a.x0, a.x1],
	n = 300
) {
	ctx.save();
	ctx.beginPath();
	ctx.rect(a.box.x, a.box.y, a.box.w, a.box.h);
	ctx.clip();
	ctx.strokeStyle = style;
	ctx.lineWidth = width;
	ctx.setLineDash(dash);
	ctx.beginPath();
	let pen = false;
	for (let i = 0; i <= n; i++) {
		const x = range[0] + ((range[1] - range[0]) * i) / n;
		const y = fn(x);
		if (!Number.isFinite(y)) {
			pen = false;
			continue;
		}
		if (pen) ctx.lineTo(a.X(x), a.Y(y));
		else ctx.moveTo(a.X(x), a.Y(y));
		pen = true;
	}
	ctx.stroke();
	ctx.restore();
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, 7);
	ctx.fill();
}

export function label(ctx: CanvasRenderingContext2D, COL: Palette, text: string, x: number, y: number, color = COL.muted, align: CanvasTextAlign = 'left', px = 10) {
	ctx.save();
	ctx.font = COL.font(px);
	ctx.fillStyle = color;
	ctx.textAlign = align;
	ctx.fillText(text, x, y);
	ctx.restore();
}

export function vline(ctx: CanvasRenderingContext2D, a: Axes, x: number, style: string, dash: number[] = [3, 4]) {
	ctx.save();
	ctx.strokeStyle = style;
	ctx.setLineDash(dash);
	ctx.beginPath();
	ctx.moveTo(a.X(x), a.box.y);
	ctx.lineTo(a.X(x), a.box.y + a.box.h);
	ctx.stroke();
	ctx.restore();
}

export function hline(ctx: CanvasRenderingContext2D, a: Axes, y: number, style: string, dash: number[] = [3, 4]) {
	ctx.save();
	ctx.strokeStyle = style;
	ctx.setLineDash(dash);
	ctx.beginPath();
	ctx.moveTo(a.box.x, a.Y(y));
	ctx.lineTo(a.box.x + a.box.w, a.Y(y));
	ctx.stroke();
	ctx.restore();
}

export function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, style: string, width = 1.4, head = 7) {
	const ang = Math.atan2(y1 - y0, x1 - x0);
	ctx.save();
	ctx.strokeStyle = style;
	ctx.lineWidth = width;
	ctx.beginPath();
	ctx.moveTo(x0, y0);
	ctx.lineTo(x1, y1);
	ctx.moveTo(x1, y1);
	ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4));
	ctx.moveTo(x1, y1);
	ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4));
	ctx.stroke();
	ctx.restore();
}
