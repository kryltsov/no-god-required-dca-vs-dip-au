/**
 * FRICTIONLESS strategy simulator (first model, superseded by engine.ts, README, "The model"): total-return
 * prices, so dividends are reinvested instantly and free, and no brokerage. Kept so E01/E02-frictionless
 * can be reproduced. See README, "The model".
 *
 * Every strategy gets the same dollars on the same days (`monthly` on the first trading day of each
 * month) and is valued on the same last day. Nothing is ever sold except idle cash leaving its
 * parking place to buy. Brokerage is not modelled in the base case (PLAN §6 puts it in the
 * sensitivity). A signal read at the close of row k is acted on at the close of row k + lag.
 */
import { loadSeries, type Series } from './data.js';
import { episodeStarts, ruleLevel, RULES, type RuleName } from './indicators.js';

export interface Market {
	days: string[];
	price: Record<string, number[]>; // adjusted close, carried forward, NaN before first row
	raw: Record<string, number[]>; // as-traded close, carried forward (steps at a split)
	/** Per ticker: dividends as master-day indices (first day on or after each date). */
	divs: Record<string, { ex: number; pay: number; perUnit: number }[]>;
	splits: Record<string, { idx: number; ratio: number }[]>;
	level: Record<string, Record<RuleName, boolean[]>>;
	start: Record<string, Record<RuleName, boolean[]>>;
	monthStart: boolean[]; // first master day of each calendar month
}

/**
 * Align every ticker to the calendar ticker's trading days. Indicators are computed on each
 * ticker's OWN rows (a US-hours holiday must not fake a flat day), then mapped onto the master
 * days: a master day sees the level of the latest own row on or before it, and an episode start
 * on any own row since the previous master day.
 */
export function buildMarket(tickers: string[], calendarTicker: string): Market {
	const all = new Map<string, Series>();
	for (const t of new Set([...tickers, calendarTicker])) all.set(t, loadSeries(t));
	const days = all.get(calendarTicker)!.dates;
	const price: Market['price'] = {};
	const raw: Market['raw'] = {};
	const divs: Market['divs'] = {};
	const splits: Market['splits'] = {};
	const firstOnOrAfter = (d: string) => {
		let lo = 0;
		let hi = days.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (days[mid] < d) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	};
	const level: Market['level'] = {};
	const start: Market['start'] = {};
	for (const [t, s] of all) {
		const p = new Array<number>(days.length).fill(NaN);
		const rw = new Array<number>(days.length).fill(NaN);
		const lv = {} as Record<RuleName, boolean[]>;
		const st = {} as Record<RuleName, boolean[]>;
		const nativeLevel = {} as Record<RuleName, boolean[]>;
		const nativeStart = {} as Record<RuleName, boolean[]>;
		for (const r of RULES) {
			nativeLevel[r] = ruleLevel(r, s.bars);
			nativeStart[r] = episodeStarts(nativeLevel[r]);
			lv[r] = new Array<boolean>(days.length).fill(false);
			st[r] = new Array<boolean>(days.length).fill(false);
		}
		let j = -1; // last own row on or before master day
		for (let i = 0; i < days.length; i++) {
			const from = j + 1;
			while (j + 1 < s.dates.length && s.dates[j + 1] <= days[i]) j++;
			if (j >= 0) {
				p[i] = s.adj[j];
				rw[i] = s.raw[j];
			}
			for (const r of RULES) {
				if (j >= 0) lv[r][i] = nativeLevel[r][j];
				for (let q = from; q <= j; q++) if (nativeStart[r][q]) st[r][i] = true;
			}
		}
		price[t] = p;
		raw[t] = rw;
		divs[t] = s.dividends
			.map((d) => ({ ex: firstOnOrAfter(d.exDate), pay: firstOnOrAfter(d.payDate), perUnit: d.perUnit }))
			.filter((d) => d.ex < days.length && d.pay < days.length);
		splits[t] = s.splits.map((x) => ({ idx: firstOnOrAfter(x.date), ratio: x.ratio }));
		level[t] = lv;
		start[t] = st;
	}
	const monthStart = days.map((d, i) => i === 0 || d.slice(0, 7) !== days[i - 1].slice(0, 7));
	return { days, price, raw, divs, splits, level, start, monthStart };
}

export type Strategy =
	/** `sleeve`: each fund gets its own share of the money in its own pot and buys when that pot clears the minimum (the mix-neutral control for pot-per-fund dip-buyers). */
	| { kind: 'dca'; sleeve?: boolean }
	| { kind: 'lump' }
	/** Hindsight: everything saved is bought at each lowest close between two all-time highs. */
	| { kind: 'god'; ref: string }
	| {
			kind: 'timer';
			rule: RuleName;
			trigger: 'episode' | 'level';
			/** pool: one cash pot, fired by any of `signalOn`, spent by weight. sleeve: a pot per asset, each fired by its own signal. */
			mode: 'pool' | 'sleeve';
			signalOn?: string[];
			/** Invest cash older than this many months regardless of any signal. */
			deadlineMonths?: number;
	  };

export interface Config {
	/** Target weights, summing to 1. Also the contribution split. */
	weights: Record<string, number>;
	monthly: number;
	/** Where idle cash waits: a cash ETF ticker, or 'zero' for 0% (the labelled worst case). */
	cash: string | 'zero';
	/** Rows between reading a signal and buying. */
	lag: number;
}

export interface Result {
	contributed: number;
	final: number;
	buys: number;
	avgCashShare: number;
	cashLeft: number;
}

const monthsBetween = (a: string, b: string) =>
	(+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

/** Indices (within [a, e]) of the lowest close between each pair of consecutive all-time highs. */
export function godDips(p: number[], a: number, e: number): Set<number> {
	const highs: number[] = [];
	let max = -Infinity;
	for (let i = a; i <= e; i++) {
		if (p[i] >= max) {
			max = p[i];
			highs.push(i);
		}
	}
	const dips = new Set<number>();
	for (let h = 1; h < highs.length; h++) {
		if (highs[h] - highs[h - 1] < 2) continue;
		let best = highs[h - 1] + 1;
		for (let i = best; i < highs[h]; i++) if (p[i] < p[best]) best = i;
		dips.add(best);
	}
	return dips;
}

export function run(m: Market, cfg: Config, strat: Strategy, a: number, e: number): Result {
	const assets = Object.keys(cfg.weights);
	const units: Record<string, number> = Object.fromEntries(assets.map((t) => [t, 0]));
	const cashPx = (i: number) => (cfg.cash === 'zero' ? 1 : m.price[cfg.cash][i]);
	// pots: key '*' (pool) or asset ticker (sleeve); each a list of lots {units of cash, day index}
	const pots: Record<string, { u: number; day: number }[]> = {};
	const potKeys = strat.kind === 'timer' && strat.mode === 'sleeve' ? assets : ['*'];
	for (const k of potKeys) pots[k] = [];
	const potValue = (k: string, i: number) => pots[k].reduce((s, l) => s + l.u, 0) * cashPx(i);
	const dips = strat.kind === 'god' ? godDips(m.price[strat.ref], a, e) : new Set<number>();

	let contributed = 0;
	let buys = 0;
	let cashShareSum = 0;
	let days = 0;

	const buy = (i: number, dollars: number, keys: string[], w: Record<string, number>) => {
		const tw = keys.reduce((s, t) => s + w[t], 0);
		for (const t of keys) units[t] += (dollars * (w[t] / tw)) / m.price[t][i];
		buys++;
	};
	const spendPot = (k: string, i: number) => {
		const v = potValue(k, i);
		if (v <= 0) return;
		pots[k] = [];
		if (k === '*') buy(i, v, assets, cfg.weights);
		else buy(i, v, [k], { [k]: 1 });
	};

	const contribDays = [];
	for (let i = a; i <= e; i++) if (m.monthStart[i]) contribDays.push(i);

	for (let i = a; i <= e; i++) {
		// 1. contribution
		if (m.monthStart[i]) {
			contributed += cfg.monthly;
			if (strat.kind === 'dca') buy(i, cfg.monthly, assets, cfg.weights);
			else if (strat.kind === 'lump') {
				// the whole window's money, bought once, on the first day
				if (i === a) {
					buy(i, cfg.monthly * contribDays.length, assets, cfg.weights);
				}
			} else if (strat.kind === 'timer' && strat.mode === 'sleeve') {
				for (const t of assets) pots[t].push({ u: (cfg.monthly * cfg.weights[t]) / cashPx(i), day: i });
			} else pots['*'].push({ u: cfg.monthly / cashPx(i), day: i });
		}
		// 2. orders
		if (strat.kind === 'god') {
			if (dips.has(i)) spendPot('*', i);
		} else if (strat.kind === 'timer') {
			const k = i - cfg.lag;
			const fired = (t: string) =>
				k >= 0 && (strat.trigger === 'episode' ? m.start[t][strat.rule][k] : m.level[t][strat.rule][k]);
			if (strat.mode === 'pool') {
				if ((strat.signalOn ?? assets).some(fired)) spendPot('*', i);
			} else {
				for (const t of assets) if (fired(t)) spendPot(t, i);
			}
			if (strat.deadlineMonths !== undefined) {
				for (const key of potKeys) {
					const lots = pots[key];
					if (lots.length && monthsBetween(m.days[lots[0].day], m.days[i]) >= strat.deadlineMonths) {
						spendPot(key, i);
					}
				}
			}
		}
		// 3. daily bookkeeping for the cash-drag figure
		let cash = 0;
		for (const k of potKeys) cash += potValue(k, i);
		let inv = 0;
		for (const t of assets) inv += units[t] * m.price[t][i];
		if (cash + inv > 0) {
			cashShareSum += cash / (cash + inv);
			days++;
		}
	}
	let cashLeft = 0;
	for (const k of potKeys) cashLeft += potValue(k, e);
	let final = cashLeft;
	for (const t of assets) final += units[t] * m.price[t][e];
	return { contributed, final, buys, avgCashShare: days ? cashShareSum / days : 0, cashLeft };
}
