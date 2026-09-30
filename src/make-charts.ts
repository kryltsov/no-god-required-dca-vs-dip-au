/**
 * Figures for the articles: portfolio value over time with a dot at every buy, the contributed
 * money as a step line, cash waiting as a shaded area, and cumulative brokerage in its own panel
 * (it is far too small to share the value axis, and two measures on one axis would mislead).
 *
 *   npx tsx src/make-charts.ts
 *
 * Writes static SVGs to figures/. Every dot carries a native tooltip
 * (date, amount, brokerage). Colours are the validated reference palette (blue slot 1 = DCA,
 * orange slot 2 = the dip-buyer), light and dark by `prefers-color-scheme`, text in ink tokens.
 * The numbers under each chart come from the same run as the findings tables.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMarket, run, type Config, type Market, type Strategy, type Trace } from './lib/engine.js';
import { RULE_LABEL, type RuleName } from './lib/indicators.js';

const OUT = join(import.meta.dirname, '..', 'figures');
const FIRST = '2013-01-01';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-AU')}`;
const k = (x: number) => (x === 0 ? '$0' : `$${Math.round(x / 1000)}k`);

interface Panel {
	label: string; // panel heading
	short: string; // end-of-line label
	sub: string; // "189 buys, $567 brokerage, $27 cash left"
	trace: Trace;
	cls: 's1' | 's2';
}

function niceMax(v: number) {
	const steps = [10, 20, 25, 50, 100, 200, 250, 500].map((x) => x * 1000);
	return steps.find((s) => s >= v * 1.04) ?? Math.ceil(v / 100000) * 100000;
}

function chart(m: Market, title: string, note: string, a: Panel, b: Panel): string {
	const W = 920;
	const L = 58;
	const R = 132;
	const iw = W - L - R;
	const ph = 176; // value panel height
	const fh = 84; // brokerage panel height
	const top = 122;
	const gap = 46;
	const H = top + ph + gap + ph + gap + fh + gap + fh + 44;
	const n = a.trace.value.length;
	const x = (i: number) => L + (iw * i) / (n - 1);
	const ymax = niceMax(Math.max(...a.trace.value, ...b.trace.value, ...a.trace.contributed));
	const yv = (v: number, y0: number) => y0 + ph - (ph * v) / ymax;
	const fmax = Math.max(...a.trace.fees, ...b.trace.fees) * 1.1 || 1;
	const yf = (v: number, y0: number) => y0 + fh - (fh * v) / fmax;

	// year ticks
	const ticks: { i: number; y: string }[] = [];
	for (let i = 0; i < n; i++) {
		const d = m.days[a.trace.first + i];
		if (i === 0 || d.slice(0, 4) !== m.days[a.trace.first + i - 1].slice(0, 4)) ticks.push({ i, y: d.slice(0, 4) });
	}
	const xaxis = (y0: number, h: number, labels: boolean) =>
		ticks
			.map(
				(t) =>
					`<line class="grid" x1="${x(t.i)}" x2="${x(t.i)}" y1="${y0}" y2="${y0 + h}"/>` +
					(labels ? `<text class="tick" x="${x(t.i)}" y="${y0 + h + 15}" text-anchor="middle">${t.y}</text>` : '')
			)
			.join('');

	const path = (vals: number[], y0: number, step = false) => {
		let d = '';
		vals.forEach((v, i) => {
			const px = x(i);
			const py = yv(v, y0);
			d += i === 0 ? `M${px.toFixed(1)} ${py.toFixed(1)}` : step ? `H${px.toFixed(1)}V${py.toFixed(1)}` : `L${px.toFixed(1)} ${py.toFixed(1)}`;
		});
		return d;
	};

	const valuePanel = (p: Panel, y0: number) => {
		const t = p.trace;
		const yticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);
		const grid = yticks
			.map(
				(v) =>
					`<line class="grid" x1="${L}" x2="${L + iw}" y1="${yv(v, y0)}" y2="${yv(v, y0)}"/><text class="tick" x="${L - 8}" y="${yv(v, y0) + 4}" text-anchor="end">${k(v)}</text>`
			)
			.join('');
		const cashArea =
			`M${x(0)} ${yv(0, y0)}` +
			t.cash.map((c, i) => `L${x(i).toFixed(1)} ${yv(c, y0).toFixed(1)}`).join('') +
			`L${x(n - 1)} ${yv(0, y0)}Z`;
		const dots = t.buys
			.map((bb) => {
				const i = bb.i - t.first;
				return `<circle class="dot ${p.cls}" cx="${x(i).toFixed(1)}" cy="${yv(t.value[i], y0).toFixed(1)}" r="3"><title>${esc(
					`${m.days[bb.i]}: bought ${bb.ticker} ${usd(bb.dollars)}, brokerage ${usd(bb.fee)}`
				)}</title></circle>`;
			})
			.join('');
		const endY = yv(t.value[n - 1], y0);
		return `
<text class="panel-title" x="${L}" y="${y0 - 22}">${esc(p.label)}</text>
<text class="panel-sub" x="${L}" y="${y0 - 7}">${esc(p.sub)}</text>
${grid}${xaxis(y0, ph, false)}
<path class="area ${p.cls}" d="${cashArea}"/>
<path class="contrib" d="${path(t.contributed, y0, true)}"/>
<path class="line ${p.cls}" d="${path(t.value, y0)}"/>
${dots}
<text class="endlabel" x="${L + iw + 8}" y="${endY + 4}">${usd(t.value[n - 1])}</text>
<text class="endlabel muted" x="${L + iw + 8}" y="${yv(t.contributed[n - 1], y0) + 4 + (Math.abs(yv(t.contributed[n - 1], y0) - endY) < 14 ? 14 : 0)}">put in ${usd(t.contributed[n - 1])}</text>`;
	};

	const y1 = top;
	const y2 = top + ph + gap;
	const y3 = y2 + ph + gap;
	const fee = (p: Panel) =>
		`<path class="line ${p.cls}" d="${p.trace.fees.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yf(v, y3).toFixed(1)}`).join('')}"/>`;
	const feeEnd = (p: Panel, nudge: number) =>
		`<text class="endlabel" x="${L + iw + 8}" y="${yf(p.trace.fees[n - 1], y3) + 4 + nudge}">${esc(p.short)} ${usd(p.trace.fees[n - 1])}</text>`;
	const fticks = [0, 0.5, 1].map((f) => f * fmax);
	const fgrid = fticks
		.map(
			(v) =>
				`<line class="grid" x1="${L}" x2="${L + iw}" y1="${yf(v, y3)}" y2="${yf(v, y3)}"/><text class="tick" x="${L - 8}" y="${yf(v, y3) + 4}" text-anchor="end">${usd(v)}</text>`
		)
		.join('');
	// panel 4: dip-buyer's value minus DCA's value, symmetric scale around zero
	const y4 = y3 + fh + gap;
	const diff = b.trace.value.map((v, i) => v - a.trace.value[i]);
	const dmax = Math.max(...diff.map(Math.abs), 1) * 1.15;
	const yd = (v: number) => y4 + fh / 2 - ((fh / 2) * v) / dmax;
	const dPath = diff.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yd(v).toFixed(1)}`).join('');
	const dGrid = [-dmax, 0, dmax]
		.map(
			(v) =>
				`<line class="grid" x1="${L}" x2="${L + iw}" y1="${yd(v)}" y2="${yd(v)}"/><text class="tick" x="${L - 8}" y="${yd(v) + 4}" text-anchor="end">${v === 0 ? '$0' : (v > 0 ? '+' : '-') + usd(Math.abs(v))}</text>`
		)
		.join('');
	const last = diff[n - 1];
	const gapFee = Math.abs(yf(a.trace.fees[n - 1], y3) - yf(b.trace.fees[n - 1], y3));
	const nudgeA = gapFee < 14 ? (a.trace.fees[n - 1] >= b.trace.fees[n - 1] ? -7 : 7) : 0;
	const nudgeB = gapFee < 14 ? -nudgeA : 0;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(note)}</desc>
<style>
svg{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--grid:#e8e7e3;--s1:#2a78d6;--s2:#eb6834;--contrib:#8a8984;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
@media (prefers-color-scheme:dark){svg{--surface:#1a1a19;--ink:#fff;--ink2:#c3c2b7;--grid:#34332f;--s1:#3987e5;--s2:#d95926;--contrib:#8f8e88}}
.bg{fill:var(--surface)}
.title{font-size:16px;font-weight:600;fill:var(--ink)}
.note{font-size:12px;fill:var(--ink2)}
.panel-title{font-size:13px;font-weight:600;fill:var(--ink)}
.panel-sub{font-size:12px;fill:var(--ink2)}
.tick{font-size:11px;fill:var(--ink2)}
.endlabel{font-size:12px;fill:var(--ink)}
.endlabel.muted{fill:var(--ink2)}
.grid{stroke:var(--grid);stroke-width:1}
.line{fill:none;stroke-width:2;stroke-linejoin:round}
.line.s1{stroke:var(--s1)}.line.s2{stroke:var(--s2)}.line.k{stroke:var(--ink2)}
.zero{stroke:var(--ink2);stroke-width:1}
.contrib{fill:none;stroke:var(--contrib);stroke-width:1.5}
.area{opacity:.28}.area.s1{fill:var(--s1)}.area.s2{fill:var(--s2)}.area.k{fill:var(--ink2);opacity:.3}
.dot{stroke:var(--surface);stroke-width:1.5}.dot.s1{fill:var(--s1)}.dot.s2{fill:var(--s2)}.dot.k{fill:var(--ink2)}
</style>
<rect class="bg" width="${W}" height="${H}"/>
<text class="title" x="${L}" y="26">${esc(title)}</text>
<text class="note" x="${L}" y="46">${esc(note)}</text>
<g transform="translate(${L},62)">
<line class="contrib" x1="0" x2="22" y1="5" y2="5"/><text class="note" x="28" y="9">money put in</text>
<line class="line k" x1="118" x2="140" y1="5" y2="5"/><text class="note" x="146" y="9">value: holdings + cash</text>
<rect class="area k" x="290" y="0" width="22" height="10"/><text class="note" x="318" y="9">cash waiting to be spent</text>
<circle class="dot k" cx="486" cy="5" r="3"/><text class="note" x="496" y="9">a buy (hover for date and amount)</text>
</g>
${valuePanel(a, y1)}
${valuePanel(b, y2)}
<text class="panel-title" x="${L}" y="${y3 - 22}">Brokerage paid so far (its own scale: too small for the panels above)</text>
${fgrid}${xaxis(y3, fh, false)}
${fee(a)}${fee(b)}
${feeEnd(a, nudgeA)}${feeEnd(b, nudgeB)}
<text class="panel-title" x="${L}" y="${y4 - 22}">Dip-buyer's value minus DCA's value (own scale: above zero = dip-buyer ahead)</text>
${dGrid}${xaxis(y4, fh, true)}
<line class="zero" x1="${L}" x2="${L + iw}" y1="${yd(0)}" y2="${yd(0)}"/>
<path class="line s2" d="${dPath}"/>
<text class="endlabel" x="${L + iw + 8}" y="${yd(last) + 4}">${last >= 0 ? '+' : '-'}${usd(Math.abs(last))}</text>
</svg>
`;
}

function panel(m: Market, cfg: Config, label: string, short: string, strat: Strategy, a: number, e: number, cls: 's1' | 's2'): Panel {
	const r = run(m, cfg, strat, a, e, true);
	return {
		label,
		short,
		sub: `${r.buys} buys, ${usd(r.fees)} brokerage, ${usd(r.cashLeft)} cash left at the end, ${usd(r.gain)} gained`,
		trace: r.trace!,
		cls
	};
}

mkdirSync(OUT, { recursive: true });
const build = (weights: Record<string, number>, sig?: string[]) => {
	const m = buildMarket([...Object.keys(weights), 'AAA'], 'VAS');
	const a = m.days.findIndex((d, i) => m.monthStart[i] && d >= FIRST);
	const cfg: Config = { weights, monthly: 500, cash: 'AAA', lag: 1, fee: 3, maxPct: 0.01 };
	return { m, a, e: m.days.length - 1, cfg, sig };
};
const written: string[] = [];
const emit = (file: string, svg: string) => {
	writeFileSync(join(OUT, file), svg);
	written.push(file);
};

const vas = build({ VAS: 1 });
const span = `${vas.m.days[vas.a]} to ${vas.m.days[vas.e]}`;
const dcaVas = panel(vas.m, vas.cfg, 'DCA: buy on the day the money arrives', 'DCA', { kind: 'dca' }, vas.a, vas.e, 's1');
const SHORT: Record<string, string> = { rsi: 'RSI', ma200: '200-day', bollinger: 'Bollinger', stoch: 'Stochastic', god: 'God' };
const timers: [string, string, Strategy][] = [
	['rsi', RULE_LABEL.rsi, { kind: 'timer', rule: 'rsi', trigger: 'episode', mode: 'pool' }],
	['ma200', RULE_LABEL.ma200, { kind: 'timer', rule: 'ma200', trigger: 'episode', mode: 'pool' }],
	['bollinger', RULE_LABEL.bollinger, { kind: 'timer', rule: 'bollinger', trigger: 'episode', mode: 'pool' }],
	['stoch', RULE_LABEL.stoch, { kind: 'timer', rule: 'stoch', trigger: 'episode', mode: 'pool' }],
	['god', 'God: buys the lowest close between two all-time highs (hindsight)', { kind: 'god', ref: 'VAS' }]
];
for (const [id, label, strat] of timers)
	emit(
		`vas-dca-vs-${id}.svg`,
		chart(
			vas.m,
			`DCA against ${id === 'god' ? 'hindsight (God)' : SHORT[id]}: VAS, $500 a month`,
			`${span}. Dip-buyer: ${id === 'god' ? 'hindsight' : RULE_LABEL[id as RuleName]}. $3 brokerage, whole units, cash waits in AAA. Historical scenario, not a forecast.`,
			dcaVas,
			panel(vas.m, vas.cfg, label, SHORT[id], strat, vas.a, vas.e, 's2')
		)
	);

// the same RSI rule, acted on 22 trading days (about a month) after the signal instead of 1
emit(
	'vas-dca-vs-rsi-late22.svg',
	chart(
		vas.m,
		'DCA against RSI acted on a month late: VAS, $500 a month',
		`${span}. Dip-buyer: RSI(14) < 30, buying 22 trading days after the signal. $3 brokerage. Not a forecast.`,
		dcaVas,
		panel(vas.m, { ...vas.cfg, lag: 22 }, 'RSI(14) < 30, buying a month after the signal', 'Late RSI', timers[0][2], vas.a, vas.e, 's2')
	)
);

// Stockspot Topaz (High growth), fact sheet 30 June 2026. Same weights as run-experiment.ts.
const W = { VAS: 0.473, IOO: 0.098, IEM: 0.209, IAF: 0.097, GOLD: 0.123 };
const div = build(W);
const dcaDiv = panel(div.m, div.cfg, 'DCA: Stockspot Topaz mix (VAS 47%, IEM 21%, GOLD 12%, IOO 10%, IAF 10%)', 'DCA', { kind: 'dca' }, div.a, div.e, 's1');
for (const rule of ['rsi', 'stoch'] as RuleName[])
	emit(
		`diversified-dca-vs-${rule}.svg`,
		chart(
			div.m,
			`DCA against ${SHORT[rule]}: five-fund Topaz portfolio, $500 a month`,
			`${span}. Dip-buyer: ${RULE_LABEL[rule]}. One pot, spent when VAS, IOO or IEM fires. $3 brokerage. Not a forecast.`,
			dcaDiv,
			panel(div.m, div.cfg, `Dip-buyer: ${RULE_LABEL[rule]}, one pot`, SHORT[rule], { kind: 'timer', rule, trigger: 'episode', mode: 'pool', signalOn: ['VAS', 'IOO', 'IEM'] }, div.a, div.e, 's2')
		)
	);
console.log(written.join('\n'));

// a pot per fund: the dip-buyer against DCA run the same way, so both hold the same money per fund
{
	const dcaPots = panel(div.m, div.cfg, 'DCA, a pot per fund: each fund buys when its own pot reaches $300', 'DCA', { kind: 'dca', sleeve: true }, div.a, div.e, 's1');
	emit(
		'diversified-pots-dca-vs-rsi.svg',
		chart(
			div.m,
			'DCA against RSI, a pot per fund: five-fund Topaz portfolio, $500 a month',
			`${span}. Each fund waits for its own signal. $3 brokerage. Both sides hold the same money per fund. Not a forecast.`,
			dcaPots,
			panel(div.m, div.cfg, 'Dip-buyer: RSI(14) < 30, a pot per fund', 'RSI', { kind: 'timer', rule: 'rsi', trigger: 'episode', mode: 'sleeve' }, div.a, div.e, 's2')
		)
	);
	console.log(written.join('\n'));
}
