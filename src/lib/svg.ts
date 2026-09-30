/**
 * A tiny static-SVG chart toolkit for the article figures. No dependencies. Follows the dataviz rules
 * used for the four-panel charts in make-charts.ts: one axis per chart (never dual axis), thin marks,
 * recessive hairline grid, text in ink tokens (never the series colour), direct labels, a native
 * tooltip (<title>) on every mark, light and dark by prefers-color-scheme, and a <desc> for screen readers.
 *
 * Colours are the validated categorical order: blue, orange, aqua, yellow, magenta (classes s1 to s5), plus a
 * neutral grey (mu). Where a chart compares DCA with the dip-buyer, blue is DCA and orange the dip-buyer.
 */

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const usd = (x: number) => `${x < 0 ? '-' : ''}$${Math.round(Math.abs(x)).toLocaleString('en-AU')}`;
export const ratio = (x: number) => x.toFixed(3);

export const CSS = `
svg{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e8e7e3;--mu:#8a8984;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
@media (prefers-color-scheme:dark){svg{--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--grid:#34332f;--mu:#8f8e88;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181}}
.bg{fill:var(--surface)}
.title{font-size:16px;font-weight:600;fill:var(--ink)}
.note{font-size:12px;fill:var(--ink2)}
.lab{font-size:12px;fill:var(--ink)}
.sub{font-size:11px;fill:var(--ink2)}
.tick{font-size:11px;fill:var(--ink2)}
.grid{stroke:var(--grid);stroke-width:1}
.ref{stroke:var(--ink2);stroke-width:1}
.band{fill:var(--ink2);opacity:.1}
.f1{fill:var(--s1)}.f2{fill:var(--s2)}.f3{fill:var(--s3)}.f4{fill:var(--s4)}.f5{fill:var(--s5)}.fm{fill:var(--mu)}
.k1{stroke:var(--s1)}.k2{stroke:var(--s2)}.k3{stroke:var(--s3)}.k4{stroke:var(--s4)}.k5{stroke:var(--s5)}.km{stroke:var(--mu)}
.ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.rng{fill:none;stroke-width:3;stroke-linecap:round}
.dot{stroke:var(--surface);stroke-width:1.5}
.seg{stroke:var(--surface);stroke-width:2}
`;

export type Cls = '1' | '2' | '3' | '4' | '5' | 'm';

export function wrap(W: number, H: number, title: string, note: string, desc: string, body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>${CSS}</style>
<rect class="bg" width="${W}" height="${H}"/>
<text class="title" x="24" y="28">${esc(title)}</text>
<text class="note" x="24" y="48">${esc(note)}</text>
${body}
</svg>
`;
}

export function legend(items: { label: string; cls: Cls; shape?: 'dot' | 'line' | 'box' }[], x: number, y: number): string {
	let cx = x;
	return items
		.map((it) => {
			const shape =
				it.shape === 'line'
					? `<line class="ln k${it.cls}" x1="${cx}" x2="${cx + 20}" y1="${y}" y2="${y}"/>`
					: it.shape === 'box'
						? `<rect class="f${it.cls}" x="${cx}" y="${y - 6}" width="14" height="12" rx="2"/>`
						: `<circle class="dot f${it.cls}" cx="${cx + 5}" cy="${y}" r="5"/>`;
			const w = it.shape === 'line' ? 26 : it.shape === 'box' ? 20 : 16;
			const out = `${shape}<text class="note" x="${cx + w}" y="${y + 4}">${esc(it.label)}</text>`;
			cx += w + it.label.length * 6.4 + 22;
			return out;
		})
		.join('');
}

/** Round axis ticks covering [lo, hi]. */
export function ticks(lo: number, hi: number, n = 5): number[] {
	const span = hi - lo;
	const raw = span / n;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
	const out: number[] = [];
	for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
	return out;
}

const tip = (t: string) => `<title>${esc(t)}</title>`;

/** Horizontal bars, one per row, from a zero baseline. */
export function hbars(o: {
	title: string;
	note: string;
	desc: string;
	rows: { label: string; value: number; cls: Cls; text: string; sub?: string; tip?: string }[];
	left?: number;
	W?: number;
	right?: number;
	fmt?: (v: number) => string;
}): string {
	const fmt = o.fmt ?? usd;
	const W = o.W ?? 920;
	const left = o.left ?? 210;
	const right = o.right ?? 250;
	const rowH = 38;
	const top = 72;
	const H = top + o.rows.length * rowH + 24;
	const max = Math.max(...o.rows.map((r) => r.value));
	const x = (v: number) => left + ((W - left - right) * v) / max;
	let body = '';
	for (const t of ticks(0, max, 5)) {
		body += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 20}"/><text class="tick" x="${x(t)}" y="${H - 6}" text-anchor="middle">${t === 0 ? '' : fmt(t)}</text>`;
	}
	o.rows.forEach((r, i) => {
		const y = top + i * rowH;
		body += `<text class="lab" x="${left - 10}" y="${y + 14}" text-anchor="end">${esc(r.label)}</text>`;
		body += `<rect class="f${r.cls}" x="${left}" y="${y}" width="${Math.max(2, x(r.value) - left)}" height="20" rx="3">${tip(r.tip ?? `${r.label}: ${r.text}`)}</rect>`;
		body += `<text class="lab" x="${x(r.value) + 8}" y="${y + 14}">${esc(r.text)}</text>`;
		if (r.sub) body += `<text class="sub" x="${x(r.value) + 8 + r.text.length * 6.6 + 6}" y="${y + 14}">${esc(r.sub)}</text>`;
	});
	return wrap(W, H, o.title, o.note, o.desc, body);
}

/** Paired horizontal bars (two measures in the same unit per row). */
export function pairBars(o: {
	title: string;
	note: string;
	desc: string;
	rows: { label: string; a: number; b: number }[];
	aName: string;
	bName: string;
	aCls: Cls;
	bCls: Cls;
	fmt?: (v: number) => string;
}): string {
	const W = 920;
	const left = 170;
	const right = 90;
	const rowH = 50;
	const top = 88;
	const H = top + o.rows.length * rowH + 24;
	const fmt = o.fmt ?? usd;
	const max = Math.max(...o.rows.flatMap((r) => [r.a, r.b]));
	const x = (v: number) => left + ((W - left - right) * v) / max;
	let body = legend([{ label: o.aName, cls: o.aCls, shape: 'box' }, { label: o.bName, cls: o.bCls, shape: 'box' }], 24, 66);
	for (const t of ticks(0, max, 5)) {
		body += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 8}" y2="${H - 20}"/><text class="tick" x="${x(t)}" y="${H - 6}" text-anchor="middle">${t === 0 ? '' : fmt(t)}</text>`;
	}
	o.rows.forEach((r, i) => {
		const y = top + i * rowH;
		body += `<text class="lab" x="${left - 10}" y="${y + 20}" text-anchor="end">${esc(r.label)}</text>`;
		body += `<rect class="f${o.aCls}" x="${left}" y="${y}" width="${Math.max(2, x(r.a) - left)}" height="16" rx="3">${tip(`${r.label}, ${o.aName}: ${fmt(r.a)}`)}</rect><text class="sub" x="${x(r.a) + 6}" y="${y + 12}">${fmt(r.a)}</text>`;
		body += `<rect class="f${o.bCls}" x="${left}" y="${y + 20}" width="${Math.max(2, x(r.b) - left)}" height="16" rx="3">${tip(`${r.label}, ${o.bName}: ${fmt(r.b)}`)}</rect><text class="sub" x="${x(r.b) + 6}" y="${y + 32}">${fmt(r.b)}</text>`;
	});
	return wrap(W, H, o.title, o.note, o.desc, body);
}

/** Range rows: a line from min to max with a dot at the median, plus a reference line. */
export function ranges(o: {
	title: string;
	note: string;
	desc: string;
	rows: { label: string; min: number; med: number; max: number; cls: Cls; text: string }[];
	domain: [number, number];
	refLabel: string;
	ref?: number;
}): string {
	const W = 920;
	const left = 210;
	const right = 240;
	const rowH = 44;
	const top = 80;
	const H = top + o.rows.length * rowH + 30;
	const ref = o.ref ?? 1;
	const x = (v: number) => left + ((W - left - right) * (v - o.domain[0])) / (o.domain[1] - o.domain[0]);
	let body = '';
	for (const t of ticks(o.domain[0], o.domain[1], 6)) {
		body += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 10}" y2="${H - 24}"/><text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t.toFixed(2)}</text>`;
	}
	body += `<line class="ref" x1="${x(ref)}" x2="${x(ref)}" y1="${top - 14}" y2="${H - 24}"/><text class="sub" x="${x(ref)}" y="${top - 18}" text-anchor="middle">${esc(o.refLabel)}</text>`;
	o.rows.forEach((r, i) => {
		const y = top + i * rowH + 12;
		body += `<text class="lab" x="${left - 12}" y="${y + 4}" text-anchor="end">${esc(r.label)}</text>`;
		body += `<line class="rng k${r.cls}" x1="${x(r.min)}" x2="${x(r.max)}" y1="${y}" y2="${y}">${tip(`${r.label}: lowest ${ratio(r.min)}, middle ${ratio(r.med)}, highest ${ratio(r.max)}`)}</line>`;
		body += `<circle class="dot f${r.cls}" cx="${x(r.med)}" cy="${y}" r="6">${tip(`${r.label}: middle run ${ratio(r.med)}`)}</circle>`;
		body += `<text class="sub" x="${W - right + 14}" y="${y + 4}">${esc(r.text)}</text>`;
	});
	return wrap(W, H, o.title, o.note, o.desc, body);
}

/** Multi-series line chart on a numeric x axis with optional shaded bands and a reference line. */
export function lines(o: {
	title: string;
	note: string;
	desc: string;
	series: { name: string; cls: Cls; pts: { x: number; y: number; tip?: string }[]; width?: number }[];
	xTicks: { x: number; label: string }[];
	xDomain: [number, number];
	yDomain: [number, number];
	yFmt: (v: number) => string;
	ref?: number;
	refLabel?: string;
	bands?: { x0: number; x1: number; label: string }[];
	markers?: boolean;
	endLabels?: boolean;
	H?: number;
	W?: number;
	right?: number;
}): string {
	const W = o.W ?? 920;
	const H = o.H ?? 400;
	const L = 64;
	const R = o.right ?? 150;
	const top = 92;
	const bottom = 36;
	const x = (v: number) => L + ((W - L - R) * (v - o.xDomain[0])) / (o.xDomain[1] - o.xDomain[0]);
	const y = (v: number) => top + (H - top - bottom) * (1 - (v - o.yDomain[0]) / (o.yDomain[1] - o.yDomain[0]));
	let body = legend(o.series.map((s) => ({ label: s.name, cls: s.cls, shape: 'line' as const })), 24, 68);
	for (const b of o.bands ?? []) {
		body += `<rect class="band" x="${x(b.x0)}" y="${top}" width="${x(b.x1) - x(b.x0)}" height="${H - top - bottom}"/><text class="sub" x="${(x(b.x0) + x(b.x1)) / 2}" y="${H - bottom - 8}" text-anchor="middle">${esc(b.label)}</text>`;
	}
	for (const t of ticks(o.yDomain[0], o.yDomain[1], 5)) {
		body += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${o.yFmt(t)}</text>`;
	}
	for (const t of o.xTicks) body += `<line class="grid" x1="${x(t.x)}" x2="${x(t.x)}" y1="${top}" y2="${H - bottom}"/><text class="tick" x="${x(t.x)}" y="${H - bottom + 16}" text-anchor="middle">${esc(t.label)}</text>`;
	if (o.ref !== undefined)
		body += `<line class="ref" x1="${L}" x2="${W - R}" y1="${y(o.ref)}" y2="${y(o.ref)}"/><text class="sub" x="${L + 6}" y="${y(o.ref) - 6}">${esc(o.refLabel ?? '')}</text>`;
	// end labels, nudged apart so they do not overlap
	const ends = o.series.map((s, i) => ({ i, yy: y(s.pts[s.pts.length - 1].y) })).sort((a, b) => a.yy - b.yy);
	for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 14) ends[k].yy = ends[k - 1].yy + 14;
	const endY = new Map(ends.map((e) => [e.i, e.yy]));
	o.series.forEach((s, i) => {
		body += `<path class="ln k${s.cls}" style="stroke-width:${s.width ?? 2}px" d="${s.pts.map((p, j) => `${j ? 'L' : 'M'}${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join('')}"/>`;
		if (o.markers)
			for (const p of s.pts) body += `<circle class="dot f${s.cls}" cx="${x(p.x).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="4">${tip(p.tip ?? `${s.name}: ${o.yFmt(p.y)}`)}</circle>`;
		const last = s.pts[s.pts.length - 1];
		if (o.endLabels !== false) body += `<text class="lab" x="${x(last.x) + 8}" y="${(endY.get(i) ?? y(last.y)) + 4}">${esc(s.name)}</text>`;
	});
	return wrap(W, H, o.title, o.note, o.desc, body);
}

/** Dumbbells: two values per row joined by a line, with a reference line. */
export function dumbbells(o: {
	title: string;
	note: string;
	desc: string;
	rows: { label: string; group?: string; a: number; b: number }[];
	aName: string;
	bName: string;
	aCls: Cls;
	bCls: Cls;
	domain: [number, number];
	refLabel: string;
	ref?: number;
}): string {
	const W = 920;
	const left = 240;
	const right = 40;
	const rowH = 26;
	const top = 96;
	const groups = [...new Set(o.rows.map((r) => r.group ?? ''))];
	const H = top + o.rows.length * rowH + groups.length * 26 + 30;
	const ref = o.ref ?? 1;
	const x = (v: number) => left + ((W - left - right) * (v - o.domain[0])) / (o.domain[1] - o.domain[0]);
	let body = legend([{ label: o.aName, cls: o.aCls }, { label: o.bName, cls: o.bCls }], 24, 68);
	for (const t of ticks(o.domain[0], o.domain[1], 7)) {
		body += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 14}" y2="${H - 24}"/><text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t.toFixed(2)}</text>`;
	}
	body += `<line class="ref" x1="${x(ref)}" x2="${x(ref)}" y1="${top - 18}" y2="${H - 24}"/><text class="sub" x="${x(ref)}" y="${top - 22}" text-anchor="middle">${esc(o.refLabel)}</text>`;
	let yy = top;
	for (const g of groups) {
		if (g) {
			body += `<text class="sub" x="24" y="${yy + 8}" style="font-weight:600">${esc(g)}</text>`;
			yy += 22;
		}
		for (const r of o.rows.filter((q) => (q.group ?? '') === g)) {
			const cy = yy + 8;
			body += `<text class="lab" x="${left - 12}" y="${cy + 4}" text-anchor="end">${esc(r.label)}</text>`;
			body += `<line class="rng km" style="stroke-width:2px;opacity:.6" x1="${x(r.a)}" x2="${x(r.b)}" y1="${cy}" y2="${cy}"/>`;
			body += `<circle class="dot f${o.aCls}" cx="${x(r.a)}" cy="${cy}" r="5">${tip(`${r.label}, ${o.aName}: ${ratio(r.a)}`)}</circle>`;
			body += `<circle class="dot f${o.bCls}" cx="${x(r.b)}" cy="${cy}" r="5">${tip(`${r.label}, ${o.bName}: ${ratio(r.b)}`)}</circle>`;
			yy += rowH;
		}
	}
	return wrap(W, H, o.title, o.note, o.desc, body);
}

/** 100% stacked horizontal bars. */
export function stacks(o: {
	title: string;
	note: string;
	desc: string;
	rows: { label: string; parts: { name: string; value: number }[] }[];
	order: { name: string; cls: Cls }[];
}): string {
	const W = 920;
	const left = 230;
	const right = 30;
	const rowH = 44;
	const top = 92;
	const H = top + o.rows.length * rowH + 20;
	let body = legend(o.order.map((p) => ({ label: p.name, cls: p.cls, shape: 'box' as const })), 24, 68);
	const x = (v: number) => left + ((W - left - right) * v) / 100;
	o.rows.forEach((r, i) => {
		const y = top + i * rowH;
		body += `<text class="lab" x="${left - 12}" y="${y + 18}" text-anchor="end">${esc(r.label)}</text>`;
		let acc = 0;
		for (const p of o.order) {
			const v = r.parts.find((q) => q.name === p.name)?.value ?? 0;
			if (v <= 0) continue;
			const w = x(acc + v) - x(acc);
			body += `<rect class="seg f${p.cls}" x="${x(acc)}" y="${y}" width="${w}" height="26">${tip(`${r.label}, ${p.name}: ${v.toFixed(1)}%`)}</rect>`;
			if (w > 30) body += `<text x="${x(acc) + w / 2}" y="${y + 17}" text-anchor="middle" style="font-size:11px;fill:#fff;font-weight:600">${Math.round(v)}</text>`;
			acc += v;
		}
	});
	return wrap(W, H, o.title, o.note, o.desc, body);
}

/** Strip chart: one row per group, one dot per result, a median tick, a reference line. */
export function strips(o: {
	title: string;
	note: string;
	desc: string;
	groups: { label: string; values: number[]; cls: Cls }[];
	domain: [number, number];
	refLabel: string;
	ref?: number;
}): string {
	const W = 920;
	const left = 290;
	const right = 190;
	const rowH = 50;
	const top = 86;
	const H = top + o.groups.length * rowH + 30;
	const ref = o.ref ?? 1;
	const x = (v: number) => left + ((W - left - right) * (v - o.domain[0])) / (o.domain[1] - o.domain[0]);
	let body = '';
	for (const t of ticks(o.domain[0], o.domain[1], 7)) {
		body += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${top - 14}" y2="${H - 24}"/><text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t.toFixed(2)}</text>`;
	}
	body += `<line class="ref" x1="${x(ref)}" x2="${x(ref)}" y1="${top - 18}" y2="${H - 24}"/><text class="sub" x="${x(ref)}" y="${top - 22}" text-anchor="middle">${esc(o.refLabel)}</text>`;
	o.groups.forEach((g, i) => {
		const cy = top + i * rowH + 14;
		const sorted = [...g.values].sort((a, b) => a - b);
		const med = sorted[Math.floor(sorted.length / 2)];
		const ahead = g.values.filter((v) => v > 1.0000001).length;
		body += `<text class="lab" x="${left - 12}" y="${cy + 4}" text-anchor="end">${esc(g.label)}</text>`;
		for (const v of g.values) body += `<circle class="f${g.cls}" style="opacity:.55" cx="${x(Math.min(o.domain[1], Math.max(o.domain[0], v))).toFixed(1)}" cy="${cy}" r="4">${tip(`${g.label}: ${ratio(v)}`)}</circle>`;
		body += `<line class="ln" style="stroke:var(--ink);stroke-width:2px" x1="${x(med)}" x2="${x(med)}" y1="${cy - 12}" y2="${cy + 12}">${tip(`${g.label}: median ${ratio(med)}`)}</line>`;
		body += `<text class="sub" x="${W - right + 14}" y="${cy + 4}">${ahead} of ${g.values.length} ahead, median ${ratio(med)}</text>`;
	});
	return wrap(W, H, o.title, o.note, o.desc, body);
}

/** Vertical bars from a zero line (positive up, negative down), one per item. */
export function signedBars(o: {
	title: string;
	note: string;
	desc: string;
	items: { label: string; value: number; tip: string; cls?: Cls }[];
	yFmt: (v: number) => string;
	domain: [number, number];
	posCls: Cls;
	negCls: Cls;
}): string {
	const W = 920;
	const L = 60;
	const R = 60;
	const top = 96;
	const plotH = 280;
	const bottom = 70;
	const H = top + plotH + bottom;
	const y = (v: number) => top + plotH * (1 - (v - o.domain[0]) / (o.domain[1] - o.domain[0]));
	const slot = (W - L - R) / o.items.length;
	let body = legend([{ label: 'price higher after the delay', cls: o.posCls, shape: 'box' }, { label: 'price lower after the delay', cls: o.negCls, shape: 'box' }], 24, 68);
	for (const t of ticks(o.domain[0], o.domain[1], 6)) body += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${o.yFmt(t)}</text>`;
	body += `<line class="ref" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
	o.items.forEach((it, i) => {
		const cx = L + slot * i + slot / 2;
		const bw = Math.min(22, slot - 6);
		const y0 = y(0);
		const y1 = y(it.value);
		body += `<rect class="f${it.cls ?? (it.value >= 0 ? o.posCls : o.negCls)}" x="${cx - bw / 2}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="2">${tip(it.tip)}</rect>`;
		body += `<text class="tick" transform="translate(${cx + 3},${top + plotH + 14}) rotate(50)">${esc(it.label)}</text>`;
	});
	return wrap(W, H, o.title, o.note, o.desc, body);
}
