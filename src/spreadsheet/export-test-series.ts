/**
 * Writes the last 400 VAS rows (adjusted close/high/low) and the simulator's own indicator values
 * for them, so the spreadsheet formulas can be checked against the code the experiments used.
 *   npx tsx src/spreadsheet/export-test-series.ts <out.json>
 */
import { writeFileSync } from 'node:fs';
import { loadSeries } from '../lib/data.js';
import { rsi, ruleLevel, stochastic, sma, bollingerLower } from '../lib/indicators.js';

const s = loadSeries('VAS');
const n = 400;
const from = s.dates.length - n;
const bars = {
	close: s.bars.close.slice(from),
	high: s.bars.high.slice(from),
	low: s.bars.low.slice(from)
};
const out = {
	dates: s.dates.slice(from),
	...bars,
	rsi: rsi(bars.close, 14),
	stoch: stochastic(bars, 14, 3),
	sma50: sma(bars.close, 50),
	sma200: sma(bars.close, 200),
	bbLower: bollingerLower(bars.close, 20, 2),
	level: Object.fromEntries((['rsi', 'stoch', 'ma50', 'ma200', 'bollinger'] as const).map((r) => [r, ruleLevel(r, bars)]))
};
writeFileSync(process.argv[2], JSON.stringify(out));
