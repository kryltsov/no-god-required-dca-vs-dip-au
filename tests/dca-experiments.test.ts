import { describe, it, expect } from 'vitest';
import { bollingerLower, episodeStarts, rsi, sma, stochastic } from '../src/lib/indicators.js';
import { godDips, run, type Config, type Market } from '../src/lib/engine-total-return.js';

/**
 * The DCA-vs-buy-the-dip experiments (README): indicator arithmetic on
 * values checked by hand, and the simulator's bookkeeping on a synthetic market. Pure - no data files.
 */
describe('indicators', () => {
	it('sma averages the last n rows and is NaN before that', () => {
		const s = sma([1, 2, 3, 4, 5], 3);
		expect(s[1]).toBeNaN();
		expect(s.slice(2)).toEqual([2, 3, 4]);
	});
	it('rsi is 100 on a rising line and 0 on a falling one', () => {
		const up = Array.from({ length: 30 }, (_, i) => 100 + i);
		const down = Array.from({ length: 30 }, (_, i) => 100 - i);
		expect(rsi(up)[29]).toBe(100);
		expect(rsi(down)[29]).toBe(0);
		expect(rsi(up)[13]).toBeNaN();
	});
	it('stochastic is 0 at the bottom of the range and 100 at the top', () => {
		const close = [...Array.from({ length: 20 }, (_, i) => 100 - i), 50];
		const bars = { close, high: close, low: close };
		expect(stochastic(bars, 14, 3).at(-1)).toBe(0);
		const up = Array.from({ length: 20 }, (_, i) => i + 1);
		expect(stochastic({ close: up, high: up, low: up }, 14, 3).at(-1)).toBe(100);
	});
	it('bollinger lower band equals the mean when there is no variation', () => {
		expect(bollingerLower(new Array(25).fill(10), 20, 2)[24]).toBe(10);
	});
	it('episodeStarts marks only the first row of each run', () => {
		expect(episodeStarts([false, true, true, false, true])).toEqual([false, true, false, false, true]);
	});
});

/** A market with one asset 'X' and 'zero' cash; one contribution row every 2 rows. */
function market(px: number[], signal: boolean[]): Market {
	const n = px.length;
	const none = new Array<boolean>(n).fill(false);
	const rules = { rsi: signal, stoch: none, ma50: none, ma200: none, bollinger: none };
	return {
		days: px.map((_, i) => `2020-${String(1 + Math.floor(i / 2)).padStart(2, '0')}-${i % 2 ? '15' : '01'}`),
		price: { X: px },
		level: { X: rules },
		start: { X: rules },
		monthStart: px.map((_, i) => i % 2 === 0)
	};
}
const cfg: Config = { weights: { X: 1 }, monthly: 100, cash: 'zero', lag: 1 };

describe('simulator', () => {
	const flat = market(new Array(12).fill(10), new Array(12).fill(false));
	it('on a flat market every strategy ends with exactly what was put in', () => {
		for (const strat of [
			{ kind: 'dca' as const },
			{ kind: 'lump' as const },
			{ kind: 'god' as const, ref: 'X' },
			{ kind: 'timer' as const, rule: 'rsi' as const, trigger: 'level' as const, mode: 'pool' as const }
		]) {
			const r = run(flat, cfg, strat, 0, 11);
			expect(r.contributed).toBe(600);
			expect(r.final).toBeCloseTo(600, 9);
		}
	});
	it('a timer that never fires holds all cash to the end', () => {
		const r = run(flat, cfg, { kind: 'timer', rule: 'rsi', trigger: 'level', mode: 'pool' }, 0, 11);
		expect(r.cashLeft).toBe(600);
		expect(r.buys).toBe(0);
	});
	it('a signal on row k buys at the close of row k + lag, with the cash held then', () => {
		const px = [10, 10, 20, 20, 40, 40];
		const sig = [false, false, true, false, false, false];
		const m = market(px, sig);
		// contributions of 100 at rows 0, 2, 4. Signal at row 2, lag 1 -> buy at row 3 at price 20 with 200 held.
		const r = run(m, { ...cfg, lag: 1 }, { kind: 'timer', rule: 'rsi', trigger: 'level', mode: 'pool' }, 0, 5);
		expect(r.buys).toBe(1);
		expect(r.final).toBeCloseTo((200 / 20) * 40 + 100, 9); // 10 units at 40 + the row-4 contribution still cash
		expect(r.cashLeft).toBe(100);
	});
	it('dca beats a late timer on a rising market and the lump sum beats dca', () => {
		const px = Array.from({ length: 12 }, (_, i) => 10 + i);
		const m = market(px, px.map((_, i) => i === 10));
		const dca = run(m, cfg, { kind: 'dca' }, 0, 11).final;
		const timer = run(m, cfg, { kind: 'timer', rule: 'rsi', trigger: 'level', mode: 'pool' }, 0, 11).final;
		const lump = run(m, cfg, { kind: 'lump' }, 0, 11).final;
		expect(timer).toBeLessThan(dca);
		expect(lump).toBeGreaterThan(dca);
	});
	it('godDips finds the lowest close between two all-time highs and ignores an unfinished drawdown', () => {
		//        ATH  ..dip.. ATH  ..unfinished
		const p = [10, 8, 5, 7, 12, 11, 9];
		expect([...godDips(p, 0, 6)]).toEqual([2]);
	});
});

import { run as runReal, type Config as RealConfig } from '../src/lib/engine.js';

/** The realistic model: whole units, brokerage, smallest trade, dividends as cash, splits. */
describe('realistic simulator', () => {
	const n = 8;
	const none = new Array<boolean>(n).fill(false);
	const rules = { rsi: none, stoch: none, ma50: none, ma200: none, bollinger: none };
	const mk = (raw: number[], over: Partial<Market> = {}): Market => ({
		days: raw.map((_, i) => `2020-${String(1 + i).padStart(2, '0')}-01`),
		price: { X: raw },
		raw: { X: raw },
		divs: { X: [] },
		splits: { X: [] },
		level: { X: rules },
		start: { X: rules },
		monthStart: raw.map(() => true),
		...over
	});
	const cfg: RealConfig = { weights: { X: 1 }, monthly: 500, cash: 'zero', lag: 1, fee: 3, maxPct: 0.01 };

	it('buys whole units, charges the fee, and carries the change', () => {
		const m = mk(new Array(n).fill(30));
		const r = runReal(m, cfg, { kind: 'dca' }, 0, 0);
		// $500 at $30: floor((500-3)/30) = 16 units = $480, fee $3, $17 left
		expect(r.fees).toBe(3);
		expect(r.buys).toBe(1);
		expect(r.cashLeft).toBeCloseTo(17, 9);
		expect(r.final).toBeCloseTo(497, 9);
	});
	it('does not trade below the smallest sensible trade ($300)', () => {
		const m = mk(new Array(n).fill(30));
		const r = runReal(m, { ...cfg, monthly: 250 }, { kind: 'dca' }, 0, 0);
		expect(r.buys).toBe(0);
		expect(r.cashLeft).toBe(250);
		const two = runReal(m, { ...cfg, monthly: 250 }, { kind: 'dca' }, 0, 1); // 500 by row 1
		expect(two.buys).toBe(1);
	});
	it('pays a dividend as cash on the pay date to units held at the ex-date, and pays no one else', () => {
		const raw = new Array(n).fill(100);
		// ex on row 2, paid row 3, $1 a unit. Units bought on the ex row itself are not entitled.
		const m = mk(raw, { divs: { X: [{ ex: 2, pay: 3, perUnit: 1 }] } });
		const r = runReal(m, { ...cfg, monthly: 1000 }, { kind: 'dca' }, 0, 3);
		// row 0: $1000 buys 9 units ($903 with fee, $97 left). Row 1: $1097 buys 10 units ($1003, $94 left).
		// At row 2's ex-date the holder has 19 units, and row 2's own buy is not entitled: 19 x $1.
		expect(r.dividends).toBe(19);
	});
	it('multiplies units at a split so value does not jump', () => {
		const raw = [100, 100, 50, 50, 50, 50, 50, 50];
		const m = mk(raw, { splits: { X: [{ idx: 2, ratio: 2 }] } });
		const r = runReal(m, { ...cfg, monthly: 1000 }, { kind: 'dca' }, 0, 1);
		// rows 0-1 as above: 19 units at $100 + $94 cash = $1,994.
		expect(r.final).toBe(1994);
		const after = runReal(m, { ...cfg, monthly: 1000 }, { kind: 'dca' }, 0, 2);
		// row 2: the split doubles 19 units to 38 at $50 (still $1,900, no jump). Then $94 + $1,000 buys
		// 21 units ($1,050 + $3 fee), $41 left: 59 x $50 + $41 = $2,991 = $1,994 + $1,000 - $3 fee.
		expect(after.final).toBe(2991);
	});
	it('dip-buyer pays fewer fees than DCA and holds a cash-only run to the end when nothing fires', () => {
		const m = mk(new Array(n).fill(30));
		const t = runReal(m, cfg, { kind: 'timer', rule: 'rsi', trigger: 'level', mode: 'pool' }, 0, n - 1);
		expect(t.buys).toBe(0);
		expect(t.fees).toBe(0);
		expect(t.cashLeft).toBe(500 * n);
	});
});
