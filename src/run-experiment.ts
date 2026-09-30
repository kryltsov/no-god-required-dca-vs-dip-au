/**
 * Runs one experiment from README and writes a findings file.
 *
 *   npx tsx src/run-experiment.ts single-vas
 *
 * Offline: reads data/etfs only. The rules and parameters are the ones fixed in README
 * before any result was seen; anything added later is labelled post-hoc in the findings.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMarket, run as runReal, type Config as RealConfig, type Market, type Strategy } from './lib/engine.js';
import { run as runFrictionless } from './lib/engine-total-return.js';
import { RULES, RULE_LABEL } from './lib/indicators.js';

const FIRST_CONTRIBUTION = '2013-01-01'; // >= 200 trading days after the shortest history (IAF/AAA, 2012-03)
const OUT = join(import.meta.dirname, '..', 'findings');

/** `real`: whole units, $3 brokerage, dividends as cash (PLAN §9). `frictionless`: the first, total-return model. */
type Model = 'real' | 'frictionless';
const FEE = 3;
const MAX_PCT = 0.01;

interface Named {
	name: string;
	strat: Strategy;
	/** Sensitivity overrides. DCA is re-run at the same fee, so the ratio always compares like with like. */
	over?: { lag?: number; fee?: number };
}

function windows(m: Market, years: number | 'full', first = FIRST_CONTRIBUTION): [number, number][] {
	const last = m.days.length - 1;
	const out: [number, number][] = [];
	for (let a = 0; a <= last; a++) {
		if (!m.monthStart[a] || m.days[a] < first) continue;
		if (years === 'full') {
			out.push([a, last]);
			break;
		}
		const endDate = `${+m.days[a].slice(0, 4) + years}${m.days[a].slice(4)}`;
		let e = last;
		while (e > a && m.days[e] > endDate) e--;
		if (m.days[last] < endDate) break; // window would run past the data
		out.push([a, e]);
	}
	return out;
}

const median = (x: number[]) => {
	const s = [...x].sort((p, q) => p - q);
	return s[Math.floor(s.length / 2)];
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fx = (x: number) => x.toFixed(3);

type Cfg = Omit<RealConfig, 'fee' | 'maxPct'>;
interface Row {
	final: number;
	contributed: number;
	fees: number;
	buys: number;
	avgCashShare: number;
	cashLeft: number;
	mix?: Record<string, number>;
}
function runModel(model: Model, m: Market, cfg: Cfg, strat: Strategy, a: number, e: number, fee = FEE): Row {
	if (model === 'frictionless') return { fees: 0, ...runFrictionless(m, cfg, strat, a, e) };
	return runReal(m, { ...cfg, fee, maxPct: MAX_PCT }, strat, a, e);
}

const mixOf = (rs: Row[]) => {
	if (!rs[0]?.mix || Object.keys(rs[0].mix).length < 3) return '-';
	return Object.keys(rs[0].mix)
		.map((k) => `${k.replace('cash', 'cash')} ${Math.round(100 * median(rs.map((r) => r.mix![k])))}`)
		.join(' / ');
};
const cashEnd = (rs: Row[]) =>
	`${money(median(rs.map((r) => r.cashLeft)))} (${pct(median(rs.map((r) => r.cashLeft / r.final)))})`;
const money = (x: number) => `$${Math.round(x).toLocaleString('en-AU')}`;

function table(
	model: Model,
	m: Market,
	cfg: Cfg,
	strategies: Named[],
	years: number | 'full',
	baseline: Strategy = { kind: 'dca' },
	baselineName = 'DCA (the baseline)'
): string {
	const ws = windows(m, years);
	const lines = [
		'| Strategy | Windows | Median vs DCA | Beats DCA | Worst | Best | Median gain | Median fees | Avg cash held | Buys | Cash at end | Median end mix |',
		'|---|---|---|---|---|---|---|---|---|---|---|---|'
	];
	const dcaCache = new Map<number, Row[]>();
	const dcaAt = (fee: number) => {
		if (!dcaCache.has(fee)) dcaCache.set(fee, ws.map(([a, e]) => runModel(model, m, cfg, baseline, a, e, fee)));
		return dcaCache.get(fee)!;
	};
	const dca = dcaAt(FEE);
	const dcaRow = (() => {
		const rs = dca;
		return `| ${baselineName} | ${ws.length} | 1.000 | - | - | - | ${money(median(rs.map((r) => r.final - r.contributed)))} | ${money(median(rs.map((r) => r.fees)))} | ${pct(rs.reduce((t, r) => t + r.avgCashShare, 0) / rs.length)} | ${(rs.reduce((t, r) => t + r.buys, 0) / rs.length).toFixed(0)} | ${cashEnd(rs)} | ${mixOf(rs)} |`;
	})();
	lines.push(dcaRow);
	for (const s of strategies) {
		const fee = s.over?.fee ?? FEE;
		const c = s.over?.lag !== undefined ? { ...cfg, lag: s.over.lag } : cfg;
		const rs = ws.map(([a, e]) => runModel(model, m, c, s.strat, a, e, fee));
		const ratio = rs.map((r, i) => r.final / dcaAt(fee)[i].final);
		const wins = ratio.filter((v) => v > 1.0000001).length;
		lines.push(
			`| ${s.name} | ${ws.length} | ${fx(median(ratio))} | ${wins}/${ws.length} (${pct(wins / ws.length)}) | ${fx(Math.min(...ratio))} | ${fx(Math.max(...ratio))} | ${money(median(rs.map((r) => r.final - r.contributed)))} | ${money(median(rs.map((r) => r.fees)))} | ${pct(rs.reduce((t, r) => t + r.avgCashShare, 0) / rs.length)} | ${(rs.reduce((t, r) => t + r.buys, 0) / rs.length).toFixed(0)} | ${cashEnd(rs)} | ${mixOf(rs)} |`
		);
	}
	return lines.join('\n');
}

function span(m: Market, years: number | 'full'): string {
	const ws = windows(m, years);
	return years === 'full'
		? `${m.days[ws[0][0]]} to ${m.days[ws[0][1]]}`
		: `${ws.length} monthly starts, ${m.days[ws[0][0]]} to ${m.days[ws[ws.length - 1][0]]}, each ${years} years long`;
}

function modelNote(model: Model, arg: string): string {
	const cmd = `npx tsx src/run-experiment.ts ${arg}${model === 'frictionless' ? ' --frictionless' : ''}`;
	if (model === 'frictionless')
		return `> **Frictionless comparison model, not the headline.** Generated by \`${cmd}\`. Total-return prices: dividends reinvested instantly and free, fractional units, no brokerage, no tax. Kept to show how much the realistic model (README, "The model") changes the answer.\n\n`;
	return `Generated by \`${cmd}\`. Realistic model (README, "The model"): as-traded prices, whole units, $${FEE} brokerage per buy with a smallest trade of $${FEE / MAX_PCT} (brokerage at most ${MAX_PCT * 100}% of a trade), dividends paid as cash on their pay dates into the same pot as contributions, cash carried forward below the minimum, parked cash earning the cash ETF's total return with no brokerage on parking. No tax or franking. "Gain" is final value (holdings at market plus all cash) minus contributions, after brokerage. `;
}

function singleAsset(ticker: string, model: Model): string {
	const m = buildMarket([ticker, 'AAA'], ticker);
	const strategies = (cash: string): Named[] => {
		const base: Named[] = [
			{ name: 'Lump sum on day one (reference)', strat: { kind: 'lump' } },
			{ name: 'God (hindsight, article rule)', strat: { kind: 'god', ref: ticker } }
		];
		for (const trigger of ['episode', 'level'] as const)
			for (const rule of RULES)
				base.push({
					name: `${RULE_LABEL[rule]} (${trigger === 'episode' ? 'first day of dip' : 'any day in dip'})`,
					strat: { kind: 'timer', rule, trigger, mode: 'pool' }
				});
		void cash;
		return base;
	};
	let md = `# ${ticker} alone: DCA vs buying the dip\n\n`;
	md += modelNote(model, `single-${ticker.toLowerCase()}`);
	md += `$500 on the first trading day of each month, first contribution ${FIRST_CONTRIBUTION}, data to ${m.days[m.days.length - 1]}. `;
	md += `Buy executes one trading day after the signal. `;
	md += `"Median vs DCA" is strategy final value divided by DCA final value (1.000 = tie). `;
	md += `Windows overlap heavily, so "Beats DCA" counts are far from independent evidence.\n\n`;
	for (const [cash, label] of [
		['AAA', 'Idle cash parked in AAA (the fair test)'],
		['zero', 'Idle cash earns 0% (labelled worst case for the dip-buyer)']
	] as const) {
		const cfg: Cfg = { weights: { [ticker]: 1 }, monthly: 500, cash, lag: 1 };
		md += `## ${label}\n\n`;
		for (const y of [5, 7, 'full'] as const) {
			md += `### ${y === 'full' ? 'Full period' : `Rolling ${y}-year windows`}: ${span(m, y)}\n\n${table(model, m, cfg, strategies(cash), y)}\n\n`;
		}
	}
	return md;
}

/**
 * Stockspot's Topaz (High growth) portfolio, from its fact sheet dated 30 June 2026: five ETFs, weights as
 * printed (Australian shares VAS 47.3%, global shares IOO 9.8%, emerging markets IEM 20.9%, bonds IAF 9.7%,
 * gold GOLD 12.3%). Today's weights are applied to the whole period; the real portfolio changed over time.
 * Every fund has history from 2012 or earlier, so no substitutions were needed.
 */
const WEIGHTS = { VAS: 0.473, IOO: 0.098, IEM: 0.209, IAF: 0.097, GOLD: 0.123 };
/** The share funds: a dip signal on any of these fires the shared pot. */
const SHARE_FUNDS = ['VAS', 'IOO', 'IEM'];

function multiAsset(model: Model): string {
	const m = buildMarket([...Object.keys(WEIGHTS), 'AAA'], 'VAS');
	const strategies: Named[] = [
		{ name: 'Lump sum on day one (reference)', strat: { kind: 'lump' } },
		{ name: 'God on VAS dips, one pot (hindsight)', strat: { kind: 'god', ref: 'VAS' } }
	];
	for (const rule of RULES) {
		strategies.push({
			name: `${RULE_LABEL[rule]}: one pot, share-fund signal, spend by weight`,
			strat: { kind: 'timer', rule, trigger: 'episode', mode: 'pool', signalOn: SHARE_FUNDS }
		});
	}
	for (const rule of RULES) {
		strategies.push({
			name: `${RULE_LABEL[rule]}: one pot, plus 12-month deadline`,
			strat: { kind: 'timer', rule, trigger: 'episode', mode: 'pool', signalOn: SHARE_FUNDS, deadlineMonths: 12 }
		});
	}
	for (const rule of RULES) {
		strategies.push({
			name: `${RULE_LABEL[rule]}: a pot per asset, each on its own signal`,
			strat: { kind: 'timer', rule, trigger: 'episode', mode: 'sleeve' }
		});
	}
	const cfg: Cfg = { weights: WEIGHTS, monthly: 500, cash: 'AAA', lag: 1 };
	let md = `# Stockspot Topaz portfolio (VAS 47.3%, IOO 9.8%, IEM 20.9%, IAF 9.7%, GOLD 12.3%): DCA vs buying the dip\n\n`;
	md += modelNote(model, 'multi');
	md += `$500 a month split by these weights, `;
	md += `first contribution ${FIRST_CONTRIBUTION}, data to ${m.days[m.days.length - 1]}. Idle cash is parked in AAA. `;
	md += `Signals fire on the first day of a dip and are acted on one trading day later. Buying uses "smart" allocation: each slice goes to the holding furthest under target. `;
	md += `The shared calendar is VAS's trading days; other funds are carried forward on days they did not trade. `;
	md += `IAF and AAA only list from March 2012, which sets the start. Windows overlap heavily.\n\n`;
	for (const y of [5, 7, 'full'] as const) {
		md += `## ${y === 'full' ? 'Full period' : `Rolling ${y}-year windows`}: ${span(m, y)}\n\n${table(model, m, cfg, strategies, y)}\n\n`;
	}
	return md;
}

/** E03: how late the buy happens after the signal. E04: what one trade costs. VAS alone, cash in AAA. */
function sensitivity(kind: 'lag' | 'fee'): string {
	const m = buildMarket(['VAS', 'AAA'], 'VAS');
	const cfg: Cfg = { weights: { VAS: 1 }, monthly: 500, cash: 'AAA', lag: 1 };
	const rows: Named[] = [];
	if (kind === 'lag') {
		for (const lag of [1, 5, 22, 44])
			for (const rule of RULES)
				rows.push({
					name: `${RULE_LABEL[rule]}, buy ${lag === 1 ? '1 trading day' : `${lag} trading days`} after the signal`,
					strat: { kind: 'timer', rule, trigger: 'episode', mode: 'pool' },
					over: { lag }
				});
		rows.push({ name: 'God (hindsight), for reference', strat: { kind: 'god', ref: 'VAS' } });
	} else {
		for (const fee of [0, 3, 10]) {
			rows.push({ name: `DCA itself, $${fee} brokerage (ratio always 1.000; see gain, fees, buys)`, strat: { kind: 'dca' }, over: { fee } });
			for (const rule of RULES)
				rows.push({
					name: `${RULE_LABEL[rule]}, $${fee} brokerage`,
					strat: { kind: 'timer', rule, trigger: 'episode', mode: 'pool' },
					over: { fee }
				});
		}
	}
	let md = `# ${kind === 'lag' ? 'E03: signal delay' : 'E04: brokerage'} (VAS alone)\n\n`;
	md += modelNote(model, kind === 'lag' ? 'lag' : 'fee');
	md += kind === 'lag'
		? `The dip-buyer acts 1, 5, 22 or 44 trading days after the signal (44 is about two months, echoing the source article's "miss the bottom by 2 months"). The ratio is against DCA, which has no signal and so does not move.\n\n`
		: `Brokerage per buy of $0, $3 and $10. The smallest trade moves with it (brokerage at most ${MAX_PCT * 100}% of a trade): none at $0, $${3 / MAX_PCT} at $3, $${10 / MAX_PCT} at $10. Each row's ratio is against DCA at the same brokerage.\n\n`;
	for (const y of [5, 'full'] as const)
		md += `## ${y === 'full' ? 'Full period' : 'Rolling 5-year windows'}: ${span(m, y)}\n\n${table(model, m, cfg, rows, y)}\n\n`;
	return md;
}

/**
 * E05: does one event decide the delay result? Rolling 5-year windows split by whether they span the
 * February-April 2020 crash (the low was 23 March 2020). Every window has the same start rules as the
 * other experiments; nothing here was tuned.
 */
function covidSplit(): string {
	const m = buildMarket(['VAS', 'AAA'], 'VAS');
	const cfg: Cfg = { weights: { VAS: 1 }, monthly: 500, cash: 'AAA', lag: 1 };
	const ws = windows(m, 5);
	const spans = (a: number, e: number) => m.days[a] <= '2020-02-01' && m.days[e] >= '2020-04-30';
	const inW = ws.filter(([a, e]) => spans(a, e));
	const outW = ws.filter(([a, e]) => !spans(a, e));
	const lines = [
		'| Rule | Delay | Windows spanning the 2020 crash: median vs DCA | Beats DCA | Other windows: median vs DCA | Beats DCA |',
		'|---|---|---|---|---|---|'
	];
	for (const rule of RULES)
		for (const lag of [1, 5, 22, 44]) {
			const cell = (set: [number, number][]) => {
				const r = set.map(([a, e]) => {
					const c = { ...cfg, lag };
					return (
						runModel('real', m, c, { kind: 'timer', rule, trigger: 'episode', mode: 'pool' }, a, e).final /
						runModel('real', m, c, { kind: 'dca' }, a, e).final
					);
				});
				const w = r.filter((v) => v > 1.0000001).length;
				return `${fx(median(r))} | ${w}/${r.length} (${pct(w / r.length)})`;
			};
			lines.push(`| ${RULE_LABEL[rule]} | ${lag} day${lag === 1 ? '' : 's'} | ${cell(inW)} | ${cell(outW)} |`);
		}
	let md = `# E05: does one crash decide the delay result? (VAS alone)\n\n`;
	md += modelNote('real', 'covid');
	md += `Rolling 5-year windows (${ws.length}), split by whether the window starts on or before 2020-02-01 and ends on or after 2020-04-30, so it contains the whole February-April 2020 fall. ${inW.length} windows do; ${outW.length} do not (they end before the crash, or start after it). Ratio is final value against DCA's in the same window.\n\n${lines.join('\n')}\n`;
	return md;
}

/** E06: every RSI(14) < 30 episode on VAS, and what buying at the next close, or 22 trading days later, would have paid. */
function rsiEpisodes(): string {
	const m = buildMarket(['VAS', 'AAA'], 'VAS');
	const p = m.price.VAS;
	const a = m.days.findIndex((d) => d >= FIRST_CONTRIBUTION);
	const rows = [
		'| Signal day | Move from next-day price to the price 22 days later | Lowest point in the next 60 days, against the signal-day price | Days from signal to that low |',
		'|---|---|---|---|'
	];
	let up = 0;
	let n = 0;
	for (let i = a; i < p.length; i++) {
		if (!m.start.VAS.rsi[i]) continue;
		const next = p[Math.min(i + 1, p.length - 1)];
		const later = p[Math.min(i + 22, p.length - 1)];
		let lo = Infinity;
		let at = 0;
		for (let k = 1; k <= 60 && i + k < p.length; k++)
			if (p[i + k] < lo) {
				lo = p[i + k];
				at = k;
			}
		n++;
		if (later > next) up++;
		const sg = (x: number) => `${x >= 0 ? '+' : '-'}${(Math.abs(x) * 100).toFixed(1)}%`;
		rows.push(`| ${m.days[i]} | ${sg(later / next - 1)} | ${sg(lo / p[i] - 1)} | ${at} |`);
	}
	let md = `# E06: every RSI(14) < 30 episode on VAS\n\n`;
	md += modelNote('real', 'rsi-episodes');
	md += `Prices are VAS's total-return (adjusted) close. "22 days later" is 22 trading days after the next-day price, the delay used in E03. Of ${n} episodes, the price was higher 22 days later on ${up} and lower on ${n - up}. The three episodes in February-March 2020 are the crash.\n\n${rows.join('\n')}\n`;
	return md;
}

/**
 * E07: the mix-neutral test for the pot-per-fund dip-buyer. Its control is DCA run the same way
 * (each fund gets its own share of the money in its own pot), so both hold the same money per fund and
 * differ only in WHEN each fund buys. Compare with E02, where the control is one-pot DCA.
 */
function sleeves(): string {
	const m = buildMarket([...Object.keys(WEIGHTS), 'AAA'], 'VAS');
	const cfg: Cfg = { weights: WEIGHTS, monthly: 500, cash: 'AAA', lag: 1 };
	const rows: Named[] = RULES.map((rule) => ({
		name: `${RULE_LABEL[rule]}: a pot per fund, each on its own signal`,
		strat: { kind: 'timer', rule, trigger: 'episode', mode: 'sleeve' }
	}));
	let md = `# E07: a pot per fund, against DCA run the same way\n\n`;
	md += modelNote('real', 'sleeves');
	md += `Weights as in E02 (Stockspot Topaz). The baseline row is **DCA with a pot per fund**: each fund receives its share of every contribution and buys when that fund's pot clears $${FEE / MAX_PCT}. It holds the same money per fund as the dip-buyers, so any gap between them is timing, not a different mix. In E02 the baseline is one-pot DCA, which ends with a different mix.\n\n`;
	for (const y of [5, 7, 'full'] as const)
		md += `## ${y === 'full' ? 'Full period' : `Rolling ${y}-year runs`}: ${span(m, y)}\n\n${table('real', m, cfg, rows, y, { kind: 'dca', sleeve: true }, 'DCA, a pot per fund (the baseline)')}\n\n`;
	return md;
}

/** E08: each fund on its own, DCA at $500 a month, so the article can say which funds carried the portfolio. */
function funds(): string {
	const tickers = [...Object.keys(WEIGHTS), 'AAA'];
	const m = buildMarket(tickers, 'VAS');
	const a = m.days.findIndex((d, i) => m.monthStart[i] && d >= FIRST_CONTRIBUTION);
	const e = m.days.length - 1;
	const rows = [
		'| Fund | Put in | Ended with | Made | Made per $1 put in | Brokerage | Buys |',
		'|---|---|---|---|---|---|---|'
	];
	for (const t of tickers) {
		const r = runReal(m, { weights: { [t]: 1 }, monthly: 500, cash: 'AAA', lag: 1, fee: FEE, maxPct: MAX_PCT }, { kind: 'dca' }, a, e);
		rows.push(`| ${t} | ${money(r.contributed)} | ${money(r.final)} | ${money(r.gain)} | $${(r.gain / r.contributed).toFixed(2)} | ${money(r.fees)} | ${r.buys} |`);
	}
	let md = `# E08: each fund alone, DCA $500 a month, ${m.days[a]} to ${m.days[e]}\n\n`;
	md += modelNote('real', 'funds');
	md += `One fund at a time, same realistic model, same dates, so the four-fund portfolio's results can be read against what each fund did. AAA is the cash ETF the dip-buyers park money in.\n\n${rows.join('\n')}\n`;
	return md;
}

/**
 * E09: is the "buy a month late" result just VAS? The delay test (E03) on other funds, each on its own.
 * Every fund starts contributing on the first month start on or after 2013-01, or 14 months after its
 * first trading day if that is later, so the 200-day average has data. Groups: other index ETFs,
 * diversified all-in-one funds (funds of index ETFs with a fixed mix), and actively managed ETFs.
 */
const E09_GROUPS: Record<string, { title: string; note: string; tickers: string[] }> = {
	index: {
		title: 'Other index ETFs',
		note: 'Index-tracking ETFs for Australian shares (IOZ, STW, A200), international shares (IVV, NDQ, VGS, IOO), emerging markets (IEM), gold (GOLD) and Australian bonds (IAF).',
		tickers: ['IOZ', 'STW', 'A200', 'IVV', 'VGS', 'NDQ', 'IOO', 'IEM', 'GOLD', 'IAF']
	},
	allinone: {
		title: 'Diversified all-in-one ETFs',
		note: 'Funds that hold several index funds in a fixed mix and rebalance it (VDHG, VDGR, VDBA, DHHF). They are managed to a set formula, not by someone picking stocks.',
		tickers: ['VDHG', 'VDGR', 'VDBA', 'DHHF']
	},
	active: {
		title: 'Actively managed ETFs',
		note: 'ETFs where a manager chooses the holdings: Magellan Global Equities (MHG), Platinum International (PIXX) and Asia (PAXX), Montaka Global (MOGL), Switzer Dividend Growth (SWTZ) and Schroder Real Return (GROW).',
		tickers: ['MHG', 'PIXX', 'PAXX', 'MOGL', 'SWTZ', 'GROW']
	}
};

function otherFunds(group: keyof typeof E09_GROUPS): string {
	const g = E09_GROUPS[group];
	const LAGS = [1, 5, 22, 44];
	let md = `# E09: the delay test on other funds - ${g.title}\n\n`;
	md += modelNote('real', `funds-${group}`);
	md += `${g.note} Each fund on its own, $500 a month, realistic model, idle cash in AAA. Ratio = final value against DCA on the same fund over the same dates (1.000 = tie). "Full" is one run from the fund's first contribution to 2025-11-28. "5-year runs" are every five-year stretch starting in each month (medians; the count of runs is shown, and neighbouring runs overlap almost completely).\n\n`;
	const tally: Record<number, { ahead: number; total: number }> = {};
	for (const l of LAGS) tally[l] = { ahead: 0, total: 0 };
	for (const t of g.tickers) {
		const m = buildMarket([t, 'AAA'], t);
		const firstTrade = m.days[0];
		const mo = +firstTrade.slice(5, 7) + 14; // 14 months after the first trading day
		const m14 = `${+firstTrade.slice(0, 4) + Math.floor((mo - 1) / 12)}-${String(((mo - 1) % 12) + 1).padStart(2, '0')}-01`;
		const start = m14 > FIRST_CONTRIBUTION ? m14 : FIRST_CONTRIBUTION;
		const full = windows(m, 'full', start);
		const five = windows(m, 5, start);
		if (!full.length) continue;
		const cfg: Cfg = { weights: { [t]: 1 }, monthly: 500, cash: 'AAA', lag: 1 };
		const runAt = (a: number, e: number, strat: Strategy, lag: number) =>
			runModel('real', m, { ...cfg, lag }, strat, a, e);
		const dcaFull = runAt(full[0][0], full[0][1], { kind: 'dca' }, 1);
		md += `## ${t}: ${m.days[full[0][0]]} to ${m.days[full[0][1]]}, ${five.length} five-year runs\n\n`;
		md += `DCA made ${money(dcaFull.final - dcaFull.contributed)} on ${money(dcaFull.contributed)} put in.\n\n`;
		md += `| Rule | Full: 1 day | 5 days | 22 days | 44 days | 5-year runs, median: 1 day | 22 days | 44 days | Runs ahead of DCA: 1 day | 22 days | 44 days |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
		for (const rule of RULES) {
			const strat: Strategy = { kind: 'timer', rule, trigger: 'episode', mode: 'pool' };
			const fr = LAGS.map((l) => runAt(full[0][0], full[0][1], strat, l).final / dcaFull.final);
			LAGS.forEach((l, i) => {
				tally[l].total++;
				if (fr[i] > 1.0000001) tally[l].ahead++;
			});
			const cells = [1, 22, 44].map((l) => {
				const r = five.map(([a, e]) => runAt(a, e, strat, l).final / runAt(a, e, { kind: 'dca' }, 1).final);
				return { med: r.length ? fx(median(r)) : '-', win: r.length ? `${r.filter((v) => v > 1.0000001).length}/${r.length}` : '-' };
			});
			md += `| ${RULE_LABEL[rule]} | ${fr.map((v) => fx(v)).join(' | ')} | ${cells.map((c) => c.med).join(' | ')} | ${cells.map((c) => c.win).join(' | ')} |\n`;
		}
		md += `\n`;
	}
	md += `## Tally: full-period runs where the rule finished ahead of DCA\n\n| Delay | Ahead | Of |\n|---|---|---|\n`;
	for (const l of LAGS) md += `| ${l} trading day${l === 1 ? '' : 's'} | ${tally[l].ahead} | ${tally[l].total} (${g.tickers.length} funds x 5 rules) |\n`;
	return md + `\n`;
}

const which = process.argv[2];
const model: Model = process.argv.includes('--frictionless') ? 'frictionless' : 'real';
const suffix = model === 'frictionless' ? '-frictionless' : '';
mkdirSync(OUT, { recursive: true });
if (which === 'single-vas') {
	const md = singleAsset('VAS', model);
	writeFileSync(join(OUT, `E01-single-vas${suffix}.md`), md);
	console.log(md);
} else if (which === 'multi') {
	const md = multiAsset(model);
	writeFileSync(join(OUT, `E02-multi-asset${suffix}.md`), md);
	console.log(md);
} else if (which === 'sleeves') {
	const md = sleeves();
	writeFileSync(join(OUT, 'E07-pot-per-fund.md'), md);
	console.log(md);
} else if (which === 'funds') {
	const md = funds();
	writeFileSync(join(OUT, 'E08-each-fund-alone.md'), md);
	console.log(md);
} else if (which?.startsWith('funds-') && which.slice(6) in E09_GROUPS) {
	const group = which.slice(6) as keyof typeof E09_GROUPS;
	const md = otherFunds(group);
	writeFileSync(join(OUT, `E09-${group}.md`), md);
	console.log(md.split('\n').filter((l) => l.startsWith('##') || l.startsWith('| Delay') || /^\| \d+ trading/.test(l)).join('\n'));
} else if (which === 'rsi-episodes') {
	const md = rsiEpisodes();
	writeFileSync(join(OUT, 'E06-rsi-episodes.md'), md);
	console.log(md);
} else if (which === 'covid') {
	const md = covidSplit();
	writeFileSync(join(OUT, 'E05-covid-split.md'), md);
	console.log(md);
} else if (which === 'lag' || which === 'fee') {
	const md = sensitivity(which);
	writeFileSync(join(OUT, which === 'lag' ? 'E03-signal-delay.md' : 'E04-brokerage.md'), md);
	console.log(md);
} else {
	console.error('usage: run-experiment.ts single-vas | multi [--frictionless] | lag | fee');
	process.exit(1);
}
