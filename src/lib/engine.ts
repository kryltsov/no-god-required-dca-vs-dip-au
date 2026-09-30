/**
 * The realistic strategy simulator (README, "The model"), replacing the frictionless first model
 * (`engine-total-return.ts`, kept for comparison). Same strategies, same signals, but:
 *
 *  - **As-traded prices, whole units.** Units are integers and move at a split; the price steps.
 *  - **Brokerage per buy** (`fee`), and a **smallest sensible trade** = fee / maxPct (Ranny's
 *    waste-guard: brokerage at most 1% of the trade, so $3 -> $300). Below that, cash carries forward.
 *  - **Dividends are cash.** Paid on the payment date to holders of record at the ex-date (units bought
 *    on the ex-date itself are not entitled), into the same pot as contributions. A dividend row with
 *    no payment date is never paid, exactly as in Ranny's engine.
 *  - **One buy rule for every strategy.** DCA deploys the pot whenever it clears the smallest trade;
 *    the dip-buyer deploys only when its signal fires (and the pot clears the same minimum). "Smart"
 *    allocation: each slice goes to the most under-target holding.
 *  - **Parked cash** earns the cash ETF's total return (adjusted close) with no brokerage on parking
 *    or un-parking. That flatters the dip-buyer, so it is the conservative choice for a finding that
 *    the dip-buyer loses.
 *
 * Result: `final` is holdings at market + all cash; `gain = final - contributed`, with brokerage
 * already paid out of the pot and dividends received in it.
 */
import { godDips, type Config as BaseConfig, type Market, type Strategy } from './engine-total-return.js';

export { buildMarket, godDips } from './engine-total-return.js';
export type { Market, Strategy } from './engine-total-return.js';

export interface Config extends BaseConfig {
	/** Brokerage per buy, dollars. */
	fee: number;
	/** Ranny's waste-guard: largest brokerage as a fraction of a trade. Smallest trade = fee / maxPct. */
	maxPct: number;
}

export interface Result {
	contributed: number;
	final: number;
	gain: number;
	fees: number;
	dividends: number;
	buys: number;
	avgCashShare: number;
	cashLeft: number;
	/** Share of `final` in each holding and in cash, at the end. Shows allocation drift between strategies. */
	mix: Record<string, number>;
	/** Only when `run(..., trace = true)`: one row per master-day index a..e, plus every buy. */
	trace?: Trace;
}

export interface Trace {
	first: number; // master-day index of the first row
	value: number[]; // holdings at market + all cash
	contributed: number[]; // cumulative
	cash: number[]; // cash waiting in the pot(s)
	fees: number[]; // cumulative brokerage
	buys: { i: number; ticker: string; dollars: number; fee: number }[];
}

const monthsBetween = (a: string, b: string) =>
	(+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

export function run(m: Market, cfg: Config, strat: Strategy, a: number, e: number, trace = false): Result {
	const assets = Object.keys(cfg.weights);
	const minTrade = cfg.fee > 0 ? cfg.fee / cfg.maxPct : 0;
	const units: Record<string, number> = Object.fromEntries(assets.map((t) => [t, 0]));
	const cashPx = (i: number) => (cfg.cash === 'zero' ? 1 : m.price[cfg.cash][i]);
	const sleeve = (strat.kind === 'timer' && strat.mode === 'sleeve') || (strat.kind === 'dca' && !!strat.sleeve);
	const potKeys = sleeve ? assets : ['*'];
	// a pot is a list of lots: units of the cash ETF and the day the money arrived
	const pots: Record<string, { u: number; day: number }[]> = Object.fromEntries(potKeys.map((k) => [k, []]));
	const potValue = (k: string, i: number) => pots[k].reduce((s, l) => s + l.u, 0) * cashPx(i);
	const dips = strat.kind === 'god' ? godDips(m.price[strat.ref], a, e) : new Set<number>();

	let contributed = 0;
	let fees = 0;
	let dividends = 0;
	let buys = 0;
	let cashShareSum = 0;
	let days = 0;
	const tr: Trace = { first: a, value: [], contributed: [], cash: [], fees: [], buys: [] };
	const entitled = new Map<string, number>(); // "ticker:ex:pay" -> units held at the ex-date

	/** Take `dollars` out of a pot, oldest money first. */
	const takeFromPot = (k: string, dollars: number, i: number) => {
		let needUnits = dollars / cashPx(i);
		const lots = pots[k];
		while (needUnits > 1e-12 && lots.length) {
			const t = Math.min(lots[0].u, needUnits);
			lots[0].u -= t;
			needUnits -= t;
			if (lots[0].u <= 1e-12) lots.shift();
		}
	};

	/** Smart allocation of `cash` across `keys`: each slice to the largest gap to target, whole units, fee per buy. Returns dollars spent. */
	const allocate = (i: number, cash: number, keys: string[]): number => {
		const tw = keys.reduce((s, t) => s + cfg.weights[t], 0);
		const value: Record<string, number> = {};
		let held = 0;
		for (const t of keys) {
			value[t] = units[t] * m.raw[t][i];
			held += value[t];
		}
		let left = cash;
		while (left > 0 && left >= minTrade) {
			let best = keys[0];
			let bestGap = -Infinity;
			for (const t of keys) {
				const gap = (cfg.weights[t] / tw) * (held + left) - value[t];
				if (gap > bestGap) {
					bestGap = gap;
					best = t;
				}
			}
			const slice = Math.min(left, Math.max(bestGap, minTrade));
			const qty = Math.floor((slice - cfg.fee) / m.raw[best][i]);
			if (qty <= 0) break;
			const spend = qty * m.raw[best][i];
			units[best] += qty;
			value[best] += spend;
			held += spend;
			left -= spend + cfg.fee;
			fees += cfg.fee;
			buys++;
			if (trace) tr.buys.push({ i, ticker: best, dollars: spend, fee: cfg.fee });
		}
		return cash - left;
	};

	const deploy = (k: string, i: number) => {
		const v = potValue(k, i);
		if (v <= 0 || v < minTrade) return;
		const spent = allocate(i, v, k === '*' ? assets : [k]);
		if (spent > 0) takeFromPot(k, spent, i);
	};

	const contribDays: number[] = [];
	for (let i = a; i <= e; i++) if (m.monthStart[i]) contribDays.push(i);

	const addCash = (k: string, dollars: number, i: number) => pots[k].push({ u: dollars / cashPx(i), day: i });

	for (let i = a; i <= e; i++) {
		// 1. splits move units
		for (const t of assets) for (const s of m.splits[t]) if (s.idx === i) units[t] *= s.ratio;
		// 2. ex-dividend: who is entitled (units held before today's buys)
		for (const t of assets)
			for (const d of m.divs[t]) if (d.ex === i) entitled.set(`${t}:${d.ex}:${d.pay}`, units[t]);
		// 3. dividend payments into the pot
		for (const t of assets)
			for (const d of m.divs[t]) {
				if (d.pay !== i) continue;
				const cash = (entitled.get(`${t}:${d.ex}:${d.pay}`) ?? 0) * d.perUnit;
				if (cash <= 0) continue;
				dividends += cash;
				addCash(sleeve ? t : '*', cash, i);
			}
		// 4. contribution
		if (m.monthStart[i]) {
			if (strat.kind === 'lump') {
				if (i === a) {
					const total = cfg.monthly * contribDays.length;
					contributed += total;
					addCash('*', total, i);
				}
			} else {
				contributed += cfg.monthly;
				if (sleeve) for (const t of assets) addCash(t, cfg.monthly * cfg.weights[t], i);
				else addCash('*', cfg.monthly, i);
			}
		}
		// 5. buying rule
		if (strat.kind === 'dca' && strat.sleeve) for (const t of assets) deploy(t, i);
		else if (strat.kind === 'dca' || strat.kind === 'lump') deploy('*', i);
		else if (strat.kind === 'god') {
			if (dips.has(i)) deploy('*', i);
		} else {
			const k = i - cfg.lag;
			const fired = (t: string) =>
				k >= 0 && (strat.trigger === 'episode' ? m.start[t][strat.rule][k] : m.level[t][strat.rule][k]);
			if (strat.mode === 'pool') {
				if ((strat.signalOn ?? assets).some(fired)) deploy('*', i);
			} else for (const t of assets) if (fired(t)) deploy(t, i);
			if (strat.deadlineMonths !== undefined)
				for (const key of potKeys) {
					const lots = pots[key];
					if (lots.length && monthsBetween(m.days[lots[0].day], m.days[i]) >= strat.deadlineMonths) deploy(key, i);
				}
		}
		// 6. daily bookkeeping for the cash-drag figure
		let cash = 0;
		for (const key of potKeys) cash += potValue(key, i);
		let inv = 0;
		for (const t of assets) inv += units[t] * m.raw[t][i];
		if (trace) {
			tr.value.push(cash + inv);
			tr.contributed.push(contributed);
			tr.cash.push(cash);
			tr.fees.push(fees);
		}
		if (cash + inv > 0) {
			cashShareSum += cash / (cash + inv);
			days++;
		}
	}
	let cashLeft = 0;
	for (const key of potKeys) cashLeft += potValue(key, e);
	let final = cashLeft;
	for (const t of assets) final += units[t] * m.raw[t][e];
	const mix: Record<string, number> = { cash: cashLeft / final };
	for (const t of assets) mix[t] = (units[t] * m.raw[t][e]) / final;
	return {
		contributed,
		final,
		mix,
		gain: final - contributed,
		fees,
		dividends,
		buys,
		avgCashShare: days ? cashShareSum / days : 0,
		cashLeft,
		trace: trace ? tr : undefined
	};
}
