/**
 * Price loading for the DCA-vs-dip experiments. Reads the committed per-ticker export in
 * `data/` (or DCA_DATA_DIR), and uses the vendor's `adjusted_close` as a
 * total-return series: distributions reinvested, splits and consolidations already folded in.
 * `high` / `low` are scaled by the same adjustment factor so the Stochastic sees a consistent bar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bars } from './indicators.js';

export interface Dividend {
	exDate: string;
	payDate: string;
	perUnit: number; // as paid, per unit held at the time (unadjustedValue)
}

export interface Series {
	ticker: string;
	dates: string[];
	adj: number[]; // adjusted close
	raw: number[]; // as-traded close (steps at a split; units move instead)
	dividends: Dividend[]; // only rows with a payment date, as in the Ranny scenario tool
	splits: { date: string; ratio: number }[];
	bars: Bars; // adjusted close / high / low
}

/** Folder holding {TICKER}_eod.json, _dividends.json and _splits.json. Override with DCA_DATA_DIR. */
const DIR = process.env.DCA_DATA_DIR ?? join(import.meta.dirname, '..', '..', 'data');

export function loadSeries(ticker: string): Series {
	const rows = JSON.parse(readFileSync(join(DIR, `${ticker}_eod.json`), 'utf8')) as {
		date: string;
		close: number;
		high: number;
		low: number;
		adjusted_close: number;
	}[];
	const read = (suffix: string) => {
		try {
			return JSON.parse(readFileSync(join(DIR, `${ticker}_${suffix}.json`), 'utf8'));
		} catch {
			return [];
		}
	};
	const divs = read('dividends') as { date: string; paymentDate: string | null; unadjustedValue: number }[];
	const splits = read('splits') as { date: string; ratio: number }[];
	const good = rows.filter((r) => r.close > 0 && r.adjusted_close > 0);
	const f = good.map((r) => r.adjusted_close / r.close);
	return {
		ticker,
		dates: good.map((r) => r.date),
		adj: good.map((r) => r.adjusted_close),
		raw: good.map((r) => r.close),
		dividends: divs
			.filter((d) => d.paymentDate)
			.map((d) => ({ exDate: d.date, payDate: d.paymentDate!, perUnit: d.unadjustedValue })),
		splits: splits.map((x) => ({ date: x.date, ratio: x.ratio })),
		bars: {
			close: good.map((r) => r.adjusted_close),
			high: good.map((r, i) => r.high * f[i]),
			low: good.map((r, i) => r.low * f[i])
		}
	};
}
