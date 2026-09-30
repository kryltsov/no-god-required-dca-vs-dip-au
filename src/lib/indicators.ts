/**
 * Dip-rule indicators for the DCA-vs-buy-the-dip experiments (see README, "The rules").
 *
 * Every function returns one value per input row, using ONLY rows up to and including that row - no
 * lookahead. Warm-up rows return `false` (signals) or `NaN` (raw indicators).
 * Standard parameters, fixed in the plan before any result was seen.
 */

export interface Bars {
	close: number[];
	high: number[];
	low: number[];
}

export function sma(x: number[], n: number): number[] {
	const out = new Array<number>(x.length).fill(NaN);
	let sum = 0;
	for (let i = 0; i < x.length; i++) {
		sum += x[i];
		if (i >= n) sum -= x[i - n];
		if (i >= n - 1) out[i] = sum / n;
	}
	return out;
}

/** Wilder's RSI. First value at index n (needs n price changes). */
export function rsi(close: number[], n = 14): number[] {
	const out = new Array<number>(close.length).fill(NaN);
	if (close.length <= n) return out;
	let gain = 0;
	let loss = 0;
	for (let i = 1; i <= n; i++) {
		const d = close[i] - close[i - 1];
		if (d >= 0) gain += d;
		else loss -= d;
	}
	gain /= n;
	loss /= n;
	out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
	for (let i = n + 1; i < close.length; i++) {
		const d = close[i] - close[i - 1];
		gain = (gain * (n - 1) + Math.max(d, 0)) / n;
		loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
		out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
	}
	return out;
}

/** Slow stochastic: %K = 100*(close-LL)/(HH-LL) over n rows, smoothed by an m-row SMA. */
export function stochastic(bars: Bars, n = 14, m = 3): number[] {
	const raw = new Array<number>(bars.close.length).fill(NaN);
	for (let i = n - 1; i < bars.close.length; i++) {
		let hh = -Infinity;
		let ll = Infinity;
		for (let j = i - n + 1; j <= i; j++) {
			hh = Math.max(hh, bars.high[j]);
			ll = Math.min(ll, bars.low[j]);
		}
		raw[i] = hh === ll ? 50 : (100 * (bars.close[i] - ll)) / (hh - ll);
	}
	const out = new Array<number>(raw.length).fill(NaN);
	for (let i = n - 1 + m - 1; i < raw.length; i++) {
		let s = 0;
		for (let j = i - m + 1; j <= i; j++) s += raw[j];
		out[i] = s / m;
	}
	return out;
}

/** Bollinger lower band: SMA(n) - k * population standard deviation. */
export function bollingerLower(close: number[], n = 20, k = 2): number[] {
	const mean = sma(close, n);
	const out = new Array<number>(close.length).fill(NaN);
	for (let i = n - 1; i < close.length; i++) {
		let v = 0;
		for (let j = i - n + 1; j <= i; j++) v += (close[j] - mean[i]) ** 2;
		out[i] = mean[i] - k * Math.sqrt(v / n);
	}
	return out;
}

export type RuleName = 'rsi' | 'stoch' | 'ma50' | 'ma200' | 'bollinger';
export const RULES: RuleName[] = ['rsi', 'stoch', 'ma50', 'ma200', 'bollinger'];

/** The label used in tables. */
export const RULE_LABEL: Record<RuleName, string> = {
	rsi: 'RSI(14) < 30',
	stoch: 'Stochastic %K(14,3) < 20',
	ma50: 'Pullback to rising 50-day average',
	ma200: 'Pullback to rising 200-day average',
	bollinger: 'Close below Bollinger(20, 2) lower band'
};

/**
 * "Pullback to a rising moving average": the SMA is higher than it was 20 rows ago, the close
 * today is at or under 1.01 x SMA, and yesterday's close was still above 1.01 x SMA. So it is a
 * fresh touch, not drift that has been sitting on the line.
 */
function maPullback(close: number[], n: number): boolean[] {
	const avg = sma(close, n);
	const out = new Array<boolean>(close.length).fill(false);
	for (let i = n + 20; i < close.length; i++) {
		const rising = avg[i] > avg[i - 20];
		out[i] = rising && close[i] <= avg[i] * 1.01 && close[i - 1] > avg[i - 1] * 1.01;
	}
	return out;
}

/** True on every row where the rule's condition holds (a "level"). NaN warm-up gives false. */
export function ruleLevel(rule: RuleName, bars: Bars): boolean[] {
	const n = bars.close.length;
	switch (rule) {
		case 'rsi':
			return rsi(bars.close, 14).map((v) => v < 30);
		case 'stoch':
			return stochastic(bars, 14, 3).map((v) => v < 20);
		case 'ma50':
			return maPullback(bars.close, 50);
		case 'ma200':
			return maPullback(bars.close, 200);
		case 'bollinger': {
			const lo = bollingerLower(bars.close, 20, 2);
			return bars.close.map((c, i) => c < lo[i]);
		}
		default:
			return new Array<boolean>(n).fill(false);
	}
}

/** First row of each run of `true`: the "episode start". */
export function episodeStarts(level: boolean[]): boolean[] {
	return level.map((v, i) => v && !(i > 0 && level[i - 1]));
}
