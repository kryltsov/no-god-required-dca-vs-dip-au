/**
 * The fuller chart set for the canonical (Substack) versions of the articles. The four-panel "value over time"
 * charts are made by make-charts.ts; these are the summary charts: outcomes, spread across runs, delay,
 * crash split, 20 other funds, portfolio mix, brokerage, and an all-results overview.
 *
 *   npx tsx src/make-summary-charts.ts
 *
 * Every number is computed here from the same simulator the findings use (realistic model). Writes static SVGs
 * to content/dca-vs-buy-the-dip/figures/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMarket, run, type Config, type Market, type Strategy } from './lib/engine.js';
import { RULES, RULE_LABEL, type RuleName } from './lib/indicators.js';
import { dumbbells, hbars, lines, pairBars, ranges, signedBars, stacks, strips, usd, type Cls } from './lib/svg.js';

const OUT = join(import.meta.dirname, '..', 'figures');
const FIRST = '2013-01-01';
mkdirSync(OUT, { recursive: true });
const written: string[] = [];
const emit = (f: string, svg: string) => {
	writeFileSync(join(OUT, f), svg);
	written.push(f);
};

const SHORT: Record<RuleName, string> = { rsi: 'RSI below 30', stoch: 'Stochastic below 20', ma50: '50-day average', ma200: '200-day average', bollinger: 'Bollinger band' };
const RCLS: Record<RuleName, Cls> = { rsi: '2', stoch: '3', ma50: '4', ma200: '5', bollinger: '1' };
const timer = (rule: RuleName, extra: Partial<Extract<Strategy, { kind: 'timer' }>> = {}): Strategy => ({ kind: 'timer', rule, trigger: 'episode', mode: 'pool', ...extra });
const base = (weights: Record<string, number>, lag = 1, fee = 3): Config => ({ weights, monthly: 500, cash: 'AAA', lag, fee, maxPct: 0.01 });
const median = (x: number[]) => [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)];
const pctS = (x: number) => `${(x * 100).toFixed(0)}%`;

function windows(m: Market, years: number | 'full', first = FIRST): [number, number][] {
	const last = m.days.length - 1;
	const out: [number, number][] = [];
	for (let a = 0; a <= last; a++) {
		if (!m.monthStart[a] || m.days[a] < first) continue;
		if (years === 'full') return [[a, last]];
		const end = `${+m.days[a].slice(0, 4) + years}${m.days[a].slice(4)}`;
		if (m.days[last] < end) break;
		let e = last;
		while (e > a && m.days[e] > end) e--;
		out.push([a, e]);
	}
	return out;
}
const yearTicks = (m: Market, a: number, e: number, step = 1) => {
	const t: { x: number; label: string }[] = [];
	for (let i = a; i <= e; i++) if (i === a || m.days[i].slice(0, 4) !== m.days[i - 1].slice(0, 4)) if ((+m.days[i].slice(0, 4) - +m.days[a].slice(0, 4)) % step === 0) t.push({ x: i, label: m.days[i].slice(0, 4) });
	return t;
};

// ---------------------------------------------------------------- VAS alone
const vas = buildMarket(['VAS', 'AAA'], 'VAS');
const [[va, ve]] = windows(vas, 'full');
const V = base({ VAS: 1 });
const vRun = (s: Strategy, lag = 1, fee = 3, a = va, e = ve, trace = false) => run(vas, base({ VAS: 1 }, lag, fee), s, a, e, trace);
const dcaV = vRun({ kind: 'dca' });

// A1: what each approach made
{
	const rows = RULES.map((r) => ({ r, x: vRun(timer(r)) })).sort((p, q) => q.x.gain - p.x.gain);
	const god = vRun({ kind: 'god', ref: 'VAS' });
	const mk = (label: string, x: typeof dcaV, cls: Cls, extra = '') => ({
		label,
		value: x.gain,
		cls,
		text: usd(x.gain),
		sub: `${(x.final / dcaV.final).toFixed(3)} of DCA, ${x.buys} buys, ${usd(x.fees)} brokerage${extra}`,
		tip: `${label}: made ${usd(x.gain)} on ${usd(x.contributed)} put in; ${x.buys} buys; ${usd(x.fees)} brokerage; ${usd(x.cashLeft)} cash left`
	});
	emit('a1-gain-by-strategy.svg', hbars({
		title: 'What each approach made on VAS, $500 a month, 2013 to 2025',
		note: `${usd(dcaV.contributed)} put in. Gain after brokerage, dividends included. Bars start at zero, so the gaps look small because they are small. Blue is DCA, orange a dip rule, grey hindsight.`,
		desc: 'Horizontal bars of the money made by dollar-cost averaging, five dip rules and a hindsight benchmark on VAS.',
		left: 190,
		right: 430,
		rows: [mk('DCA', dcaV, '1'), ...rows.map(({ r, x }) => mk(SHORT[r], x, '2')), mk('Hindsight ("God")', god, 'm')],
		W: 1150
	}));
}

// A1: spread across every five-year run
{
	const ws = windows(vas, 5);
	const out = RULES.map((r) => {
		const ratios = ws.map(([a, e]) => vRun(timer(r), 1, 3, a, e).final / vRun({ kind: 'dca' }, 1, 3, a, e).final);
		const ahead = ratios.filter((v) => v > 1.0000001).length;
		return { label: SHORT[r], min: Math.min(...ratios), med: median(ratios), max: Math.max(...ratios), cls: RCLS[r], text: `ahead of DCA in ${ahead} of ${ws.length} runs` };
	});
	emit('a1-five-year-runs.svg', ranges({
		title: `How each rule compared with DCA over all ${ws.length} five-year runs`,
		note: 'Dot: the typical (median) run. Line: the worst and best run. Right of the grey line means the dip rule finished ahead of DCA.',
		desc: 'For each dip rule, the worst, median and best ratio of final value to DCA across every five-year run on VAS.',
		rows: out,
		domain: [0.9, 1.04],
		refLabel: 'tie with DCA'
	}));
}

// A1: how much of the money was waiting in cash
{
	const pick: { name: string; cls: Cls; s: Strategy }[] = [
		{ name: 'DCA', cls: 'm', s: { kind: 'dca' } },
		{ name: SHORT.rsi, cls: RCLS.rsi, s: timer('rsi') },
		{ name: SHORT.ma200, cls: RCLS.ma200, s: timer('ma200') },
		{ name: SHORT.stoch, cls: RCLS.stoch, s: timer('stoch') }
	];
	const series = pick.map((p) => {
		const t = vRun(p.s, 1, 3, va, ve, true).trace!;
		const pts: { x: number; y: number }[] = [];
		for (let i = 260; i < t.value.length; i += 4) pts.push({ x: va + i, y: t.cash[i] / t.value[i] });
		return { name: p.name, cls: p.cls, pts, width: p.cls === 'm' ? 2 : 1.6 };
	});
	emit('a1-cash-waiting.svg', lines({
		title: 'How much of the money was sitting in cash, VAS, 2013 to 2025',
		note: 'Share of the portfolio held as cash waiting for a signal, from 2014. DCA spends the day money arrives.',
		desc: 'Lines showing the share of portfolio value held in cash over time for DCA and three dip rules.',
		series,
		xTicks: yearTicks(vas, va + 260, ve),
		xDomain: [va + 260, ve],
		endLabels: false,
		yDomain: [0, 1],
		yFmt: (v) => pctS(v),
		right: 170,
		H: 400
	}));
}

// A2: ratio against delay
{
	const LAGS = [1, 5, 22, 44];
	const ws = windows(vas, 5);
	const mkSeries = (fn: (r: RuleName, lag: number) => number) =>
		RULES.map((r) => ({ name: SHORT[r], cls: RCLS[r], pts: LAGS.map((l, i) => ({ x: i, y: fn(r, l), tip: `${SHORT[r]}, ${l} trading days after the signal: ${fn(r, l).toFixed(3)}` })) }));
	const xt = [{ x: 0, label: 'next day' }, { x: 1, label: 'a week (5 days)' }, { x: 2, label: 'a month (22 days)' }, { x: 3, label: 'two months (44 days)' }];
	emit('a2-delay-full-period.svg', lines({
		title: 'Buying later: final value against DCA, VAS, full 12.9 years',
		note: 'Each line is one dip rule. 1.000 means a tie with DCA. Only RSI ends above the line, and only when it buys a month or more late.',
		desc: 'Ratio of final value to DCA for five dip rules when the purchase is delayed by 1, 5, 22 or 44 trading days, full period on VAS.',
		series: mkSeries((r, l) => vRun(timer(r), l).final / dcaV.final),
		xTicks: xt,
		xDomain: [-0.15, 3.15],
		yDomain: [0.96, 1.03],
		yFmt: (v) => v.toFixed(2),
		ref: 1,
		refLabel: 'DCA',
		markers: true,
		H: 400
	}));
	const med = new Map<string, number>();
	for (const r of RULES)
		for (const l of LAGS) med.set(`${r}${l}`, median(ws.map(([a, e]) => vRun(timer(r), l, 3, a, e).final / vRun({ kind: 'dca' }, 1, 3, a, e).final)));
	emit('a2-delay-five-year-median.svg', lines({
		title: `Buying later: the typical result over ${ws.length} five-year runs, VAS`,
		note: 'Median ratio to DCA across every five-year run. RSI crosses above the line at a month late; the 200-day rule is level.',
		desc: 'Median ratio of final value to DCA across five-year runs for five dip rules at four delays.',
		series: mkSeries((r, l) => med.get(`${r}${l}`)!),
		xTicks: xt,
		xDomain: [-0.15, 3.15],
		yDomain: [0.95, 1.03],
		yFmt: (v) => v.toFixed(2),
		ref: 1,
		refLabel: 'DCA',
		markers: true,
		H: 400
	}));
}

// A2: RSI by start month, next day against a month late, with the crash runs shaded
{
	const ws = windows(vas, 5);
	const ser = (lag: number, name: string, cls: Cls) => ({
		name,
		cls,
		pts: ws.map(([a, e], i) => {
			const v = vRun(timer('rsi'), lag, 3, a, e).final / vRun({ kind: 'dca' }, 1, 3, a, e).final;
			return { x: i, y: v, tip: `Start ${vas.days[a]}, ${name}: ${v.toFixed(3)}` };
		})
	});
	const spans = (a: number, e: number) => vas.days[a] <= '2020-02-01' && vas.days[e] >= '2020-04-30';
	const inIdx = ws.map(([a, e], i) => (spans(a, e) ? i : -1)).filter((i) => i >= 0);
	const tks: { x: number; label: string }[] = [];
	ws.forEach(([a], i) => {
		if (vas.days[a].slice(5, 7) === '01') tks.push({ x: i, label: vas.days[a].slice(0, 4) });
	});
	emit('a2-rsi-by-start-month.svg', lines({
		title: 'RSI against DCA, for every start month: next day and a month late',
		note: 'Each point is a five-year run beginning in that month. The shaded runs contain the whole February to April 2020 fall.',
		desc: 'Ratio of final value to DCA for the RSI rule bought the next day and bought a month late, by the month a five-year run starts. Runs containing the 2020 crash are shaded.',
		series: [ser(1, 'RSI, next day', '1'), ser(22, 'RSI, a month late', '2')],
		xTicks: tks,
		xDomain: [0, ws.length - 1],
		yDomain: [0.92, 1.05],
		yFmt: (v) => v.toFixed(2),
		ref: 1,
		refLabel: 'DCA',
		bands: [{ x0: inIdx[0], x1: inIdx[inIdx.length - 1], label: `${inIdx.length} runs that contain the 2020 crash` }],
		right: 140,
		H: 420
	}));
}

// A2: every RSI signal, what waiting 22 days did
{
	const p = vas.price.VAS;
	const items: { label: string; value: number; tip: string }[] = [];
	for (let i = va; i < p.length; i++) {
		if (!vas.start.VAS.rsi[i]) continue;
		const next = p[Math.min(i + 1, p.length - 1)];
		const later = p[Math.min(i + 22, p.length - 1)];
		const v = (later / next - 1) * 100;
		items.push({ label: vas.days[i].slice(0, 7), value: v, tip: `Signal ${vas.days[i]}: the price 22 days after the next-day buy was ${v >= 0 ? '+' : ''}${v.toFixed(1)}% against the next-day price` });
	}
	emit('a2-rsi-signals.svg', signedBars({
		title: 'Every RSI signal on VAS: what waiting a month did to the price paid',
		note: 'Price 22 trading days after the next-day buy, against the next-day price. Three bars in early 2020 are the COVID crash.',
		desc: `Bars for all ${items.length} RSI dip signals from 2013 to 2025 showing the change in price after a further 22 trading days.`,
		items,
		yFmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`,
		domain: [-25, 15],
		posCls: '3',
		negCls: '2'
	}));
}

// A2 + A5: the delay test on 20 other funds
const FUNDS: { t: string; group: string; label: string }[] = [
	...['IOZ', 'STW', 'A200', 'IVV', 'VGS', 'NDQ', 'IOO', 'IEM', 'GOLD', 'IAF'].map((t) => ({ t, group: 'Index ETFs', label: t })),
	...['VDHG', 'VDGR', 'VDBA', 'DHHF'].map((t) => ({ t, group: 'Diversified all-in-one ETFs', label: t })),
	...['MHG', 'PIXX', 'PAXX', 'MOGL', 'SWTZ', 'GROW'].map((t) => ({ t, group: 'Actively managed ETFs', label: t }))
];
const other: { t: string; group: string; label: string; r: Record<RuleName, [number, number]> }[] = [];
for (const f of FUNDS) {
	const m = buildMarket([f.t, 'AAA'], f.t);
	const mo = +m.days[0].slice(5, 7) + 14;
	const m14 = `${+m.days[0].slice(0, 4) + Math.floor((mo - 1) / 12)}-${String(((mo - 1) % 12) + 1).padStart(2, '0')}-01`;
	const [[a, e]] = windows(m, 'full', m14 > FIRST ? m14 : FIRST);
	const go = (s: Strategy, lag: number) => run(m, base({ [f.t]: 1 }, lag), s, a, e).final;
	const dca = go({ kind: 'dca' }, 1);
	const r = {} as Record<RuleName, [number, number]>;
	for (const rule of RULES) r[rule] = [go(timer(rule), 1) / dca, go(timer(rule), 22) / dca];
	other.push({ ...f, r });
}
emit('a2-other-funds-rsi.svg', dumbbells({
	title: 'RSI on 20 other funds: bought the next day, and a month late',
	note: 'Ratio of final value to DCA on the same fund and dates. Right of the line is ahead of DCA. Each fund runs from 2013 or 14 months after listing.',
	desc: 'For each of 20 ASX funds, the RSI rule ratio to DCA when bought the next day and when bought a month later.',
	rows: other.map((f) => ({ label: f.label, group: f.group, a: f.r.rsi[0], b: f.r.rsi[1] })),
	aName: 'next day',
	bName: 'a month late',
	aCls: '1',
	bCls: '2',
	domain: [0.84, 1.04],
	refLabel: 'tie with DCA'
}));

// ---------------------------------------------------------------- Topaz portfolio
const TOPAZ = { VAS: 0.473, IOO: 0.098, IEM: 0.209, IAF: 0.097, GOLD: 0.123 };
const SHARE = ['VAS', 'IOO', 'IEM'];
const tz = buildMarket([...Object.keys(TOPAZ), 'AAA'], 'VAS');
const [[ta, te]] = windows(tz, 'full');
const tRun = (s: Strategy, lag = 1) => run(tz, base(TOPAZ, lag), s, ta, te);

// A3: each fund alone
{
	const rows = [...Object.keys(TOPAZ), 'AAA'].map((t) => {
		const r = run(tz, base({ [t]: 1 }), { kind: 'dca' }, ta, te);
		return { t, gain: r.gain, per: r.gain / r.contributed, contributed: r.contributed };
	}).sort((x, y) => y.per - x.per);
	emit('a3-each-fund-alone.svg', hbars({
		title: 'Each fund on its own: dollars made per $1 put in, $500 a month, 2013 to 2025',
		note: 'The five Topaz funds and the cash ETF, each bought by DCA alone. Two of them did far better than the rest.',
		desc: 'Horizontal bars of money made per dollar contributed for VAS, IOO, IEM, IAF, GOLD and AAA.',
		rows: rows.map((r) => ({ label: r.t, value: r.per, cls: r.t === 'AAA' ? 'm' : '1', text: `$${r.per.toFixed(2)}`, sub: `${usd(r.gain)} made on ${usd(r.contributed)}`, tip: `${r.t}: $${r.per.toFixed(2)} made per $1 put in` })),
		left: 120,
		fmt: (v) => `$${v.toFixed(1)}`
	}));
}

// A3: what each portfolio ended up holding
{
	const cases: { label: string; s: Strategy }[] = [
		{ label: 'DCA, one pot', s: { kind: 'dca' } },
		{ label: 'DCA, a pot per fund', s: { kind: 'dca', sleeve: true } },
		{ label: 'Stochastic, one pot', s: timer('stoch', { signalOn: SHARE }) },
		{ label: 'Stochastic, a pot per fund', s: timer('stoch', { mode: 'sleeve' }) }
	];
	const parts = (mix: Record<string, number>) => Object.entries(mix).map(([name, v]) => ({ name, value: v * 100 }));
	const rows = [{ label: 'Target (Topaz weights)', parts: Object.entries(TOPAZ).map(([name, v]) => ({ name, value: v * 100 })) }, ...cases.map((c) => ({ label: c.label, parts: parts(tRun(c.s).mix) }))];
	emit('a3-end-mix.svg', stacks({
		title: 'What each portfolio held at the end, against the target',
		note: 'Share of final value by fund. The pot-per-fund portfolios drift towards IOO and gold, the two funds that did best.',
		desc: 'Stacked bars of the final holdings of VAS, IOO, IEM, IAF and GOLD, and cash, for four strategies against the Topaz target weights.',
		rows,
		order: [{ name: 'VAS', cls: '1' }, { name: 'IOO', cls: '2' }, { name: 'IEM', cls: '3' }, { name: 'IAF', cls: '4' }, { name: 'GOLD', cls: '5' }, { name: 'cash', cls: 'm' }]
	}));
}

// A3: the mix effect, pot per fund against two different baselines
{
	const dcaOne = tRun({ kind: 'dca' }).final;
	const dcaPots = tRun({ kind: 'dca', sleeve: true }).final;
	const rows = RULES.map((r) => {
		const f = tRun(timer(r, { mode: 'sleeve' })).final;
		return { label: SHORT[r], a: f / dcaOne, b: f / dcaPots };
	});
	emit('a3-mix-effect.svg', dumbbells({
		title: 'A pot per fund: the same result measured against two different DCA baselines',
		note: 'Against one-pot DCA some rules look ahead. Against DCA run the same way (a pot per fund), every rule is behind.',
		desc: 'For five dip rules run with a pot per fund on the Topaz portfolio, the ratio to one-pot DCA and the ratio to pot-per-fund DCA.',
		rows,
		aName: 'against one-pot DCA',
		bName: 'against DCA with a pot per fund (the fair baseline)',
		aCls: '1',
		bCls: '2',
		domain: [0.97, 1.02],
		refLabel: 'tie with DCA'
	}));
}

// ---------------------------------------------------------------- brokerage
const FEES = [0, 3, 10];
const feeRatio = new Map<string, number>();
for (const r of RULES) for (const f of FEES) feeRatio.set(`${r}${f}`, vRun(timer(r), 1, f).final / vRun({ kind: 'dca' }, 1, f).final);
emit('a4-fee-lines.svg', lines({
	title: 'Final value against DCA as brokerage rises, VAS, full period',
	note: 'Each line is a dip rule, measured against DCA at the same brokerage. Cutting the fee from $3 to $0 widens DCA\'s lead.',
	desc: 'Ratio of final value to DCA for five dip rules at brokerage of $0, $3 and $10 per buy on VAS.',
	series: RULES.map((r) => ({ name: SHORT[r], cls: RCLS[r], pts: FEES.map((f, i) => ({ x: i, y: feeRatio.get(`${r}${f}`)!, tip: `${SHORT[r]}, $${f} brokerage: ${feeRatio.get(`${r}${f}`)!.toFixed(3)}` })) })),
	xTicks: [{ x: 0, label: '$0 per buy' }, { x: 1, label: '$3 per buy' }, { x: 2, label: '$10 per buy' }],
	xDomain: [-0.1, 2.1],
	yDomain: [0.96, 1.01],
	yFmt: (v) => v.toFixed(2),
	ref: 1,
	refLabel: 'DCA',
	markers: true,
	H: 400
}));
{
	// Final values are after brokerage. Before brokerage, a rule is behind by (final gap + brokerage it saved).
	const rows = RULES.map((r) => {
		const x = vRun(timer(r));
		const saved = dcaV.fees - x.fees;
		return { label: SHORT[r], a: saved, b: dcaV.final - x.final + saved };
	});
	emit('a4-saved-vs-lost.svg', pairBars({
		title: 'Waiting cost each dip rule more than its lower brokerage gave back, VAS, $3 a trade',
		note: 'Orange: behind DCA before brokerage. Green: brokerage saved. Orange minus green is the final gap: behind in every case.',
		desc: 'For each dip rule on VAS, the shortfall against DCA before brokerage and the brokerage saved by trading less, at $3 a trade.',
		rows,
		aName: 'brokerage saved against DCA',
		bName: 'behind DCA before brokerage',
		aCls: '3',
		bCls: '2'
	}));
}

// ---------------------------------------------------------------- A5: everything at a glance
{
	const vasNext = RULES.map((r) => vRun(timer(r)).final / dcaV.final);
	const vasDelay = RULES.flatMap((r) => [1, 5, 22, 44].map((l) => vRun(timer(r), l).final / dcaV.final));
	const vasFee = RULES.flatMap((r) => FEES.map((f) => feeRatio.get(`${r}${f}`)!));
	const topOne = RULES.map((r) => tRun(timer(r, { signalOn: SHARE })).final / tRun({ kind: 'dca' }).final);
	const dcaPots = tRun({ kind: 'dca', sleeve: true }).final;
	const topPots = RULES.map((r) => tRun(timer(r, { mode: 'sleeve' })).final / dcaPots);
	const o1 = other.flatMap((f) => RULES.map((r) => f.r[r][0]));
	const o22 = other.flatMap((f) => RULES.map((r) => f.r[r][1]));
	emit('a5-all-results.svg', strips({
		title: 'Every headline result in the series: final value against DCA',
		note: 'Each dot is one rule tested on one fund or setting. The black tick is the median. Right of the grey line means the dip rule finished ahead of DCA.',
		desc: 'Strip chart of the ratio of final value to DCA across all the main experiments: VAS next-day, VAS delays, VAS brokerage, the Topaz portfolio, and 20 other funds.',
		groups: [
			{ label: 'VAS, buying the next day', values: vasNext, cls: '2' },
			{ label: 'VAS, delays from 1 day to 2 months', values: vasDelay, cls: '2' },
			{ label: 'VAS, brokerage of $0, $3 and $10', values: vasFee, cls: '2' },
			{ label: 'Topaz mix, one shared pot', values: topOne, cls: '3' },
			{ label: 'Topaz mix, a pot per fund (fair baseline)', values: topPots, cls: '3' },
			{ label: '20 other funds, buying the next day', values: o1, cls: '4' },
			{ label: '20 other funds, buying a month late', values: o22, cls: '4' }
		],
		domain: [0.84, 1.04],
		refLabel: 'tie with DCA'
	}));
}
console.log(written.join('\n'));
