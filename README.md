# No God Required: Buying the Dip vs Dollar-Cost Averaging (Australian edition)

> Open code and results: does buying the dip on RSI, moving-average or Bollinger signals beat dollar-cost averaging on ASX ETFs? Models brokerage, dividends and idle cash. Sample data only. Educational, not advice.

Code and results behind a series of articles that test dollar-cost averaging (DCA) against an investor
who holds cash and buys when a well-known dip signal fires, using daily ASX ETF prices and dividends.
Inspired by Nick Maggiulli's
[*Even God Couldn't Beat Dollar-Cost Averaging*](https://ofdollarsanddata.com/even-god-couldnt-beat-dollar-cost-averaging/)
(Of Dollars and Data, 2019).

**Articles:** the series is published on Substack (canonical): [link TBA]. Copies on LinkedIn: [link TBA],
where comments are welcome. The articles are not part of this repository, which holds the code, the
results and sample data.

**This is educational modelling of historical scenarios. It is not financial advice.** Past results are
not a forecast. It ignores tax and franking credits.

## Please check our work

Nothing here should be taken on trust. If you find a bug, a wrong assumption, or a result that
disagrees with yours, please open an issue here. Especially welcome: runs on other
funds or dates, a different data source, a second opinion on the rule definitions, and anything that
makes the simulator's bookkeeping look wrong. `tests/` covers the indicator arithmetic and the
simulator's bookkeeping (whole units, brokerage, dividends, splits).

**No price data is in this repository.** Prices come from a commercial vendor and are not ours to
redistribute. `data/` shows the file format with invented sample files, so you can supply your own.

## Run it

```sh
npm install
# put {TICKER}_eod.json, _dividends.json, _splits.json files in ./data (see data/README.md),
# or point DCA_DATA_DIR somewhere else. You need each fund named in src/run-experiment.ts, plus AAA (cash ETF).
npm test                                     # indicator and simulator checks; needs no data
npx tsx src/run-experiment.ts single-vas     # VAS alone: DCA vs five rules (writes findings/E01-single-vas.md)
npx tsx src/run-experiment.ts multi          # the five-fund Topaz mix, shared pot
npx tsx src/run-experiment.ts lag            # signal delay (1, 5, 22, 44 trading days)
npx tsx src/run-experiment.ts fee            # brokerage of $0, $3, $10
npx tsx src/run-experiment.ts covid          # runs split by whether they contain the 2020 crash
npx tsx src/run-experiment.ts sleeves        # a pot per fund against DCA run the same way
npx tsx src/run-experiment.ts funds-index    # the delay test on other funds (also funds-allinone, funds-active)
npx tsx src/make-charts.ts                   # value-over-time figures (figures/*.svg)
npx tsx src/make-summary-charts.ts           # the summary figures (outcomes, delay, mix, brokerage, all results)
```

`findings/` holds every result table we produced, as generated. `findings/README.md` is the index and
lists the caveats. Add `--frictionless` to the first two experiments for the simple comparison model.

## The rules

Five dip signals, standard settings, fixed before any result was seen, using only prices up to the day:

| Rule | Fires when |
|---|---|
| RSI | 14-day Wilder RSI below 30 |
| Stochastic | slow Stochastic %K (14 days, smoothed over 3) below 20 |
| 50-day / 200-day average | close falls to within 1% above a *rising* average (higher than 20 days ago), having been above that level the day before |
| Bollinger band | close below the lower band (20 days, 2 population standard deviations) |

A signal is read at the close and acted on `lag` trading days later (1 in the main results).
The dip-buyer spends all cash saved, on the first day of each signal episode. Definitions:
`src/lib/indicators.ts`. `src/spreadsheet/` builds a Google Sheets/Excel template that computes the same
rules from a price column, and checks its formulas against this code.

## The model

- $500 on the first trading day of every month; first contribution 2013-01 (or 14 months after a
  fund's first trade, if later) so the 200-day average has data; data to 2025-11-28.
- Trades at as-traded prices, whole units, **$3 brokerage per buy**, and no buy smaller than
  fee / 1% (= $300), so brokerage never exceeds 1% of a trade. Smaller amounts wait in the pot.
- Dividends are cash, paid on their payment dates to units held at the ex-date, into the same pot as the
  contributions. A dividend row with no payment date is never paid.
- Idle cash is parked in a cash ETF (AAA), earning its total return, with no brokerage to park or
  un-park (generous to the dip-buyer).
- DCA and the dip-buyer use the same buying rule; the dip-buyer just waits for its signal. Allocation
  across several funds: each slice goes to the holding furthest below its target weight.
- **Signals use closing prices** (dividend-adjusted; the Stochastic also uses the adjusted high and low).
  Opening prices are never used. A signal is read at the close of day k and the buy **fills at the
  as-traded close of day k+1**. There is no spread or slippage. Splits are handled by multiplying units.
  Full mechanics, formulas and known loose ends: [`METHOD.md`](METHOD.md).
- The multi-fund portfolio is Stockspot's Topaz (High growth) weights from its fact sheet of
  30 June 2026, applied to the whole period without rebalancing or fees. Stockspot has no involvement.

## Layout

```
src/lib/          data loading, indicators, the simulator (engine.ts) and the first frictionless one
src/run-experiment.ts   every experiment; src/make-charts.ts   the figures
src/spreadsheet/  builds and checks the five-minute spreadsheet
tests/            indicator and simulator checks (no data needed)
findings/         generated result tables (E01 to E09)
figures/          generated charts (SVG)
data/             the file format, with invented sample files (real price files are git-ignored)
METHOD.md         exactly how trades and numbers are made, and where the model is loose
LICENSE           MIT
spreadsheet/      the template (no price data)
```

## Limits

One country, about 13 years, one fast crash (2020) and one fall (2022), no 2008. Overlapping
five-year runs are not independent experiments. Five rules with standard settings. A disciplined
investor who follows the rule exactly. No tax. The findings README lists more.

## How it was made

I have wanted to test a real version of this comparison for a long time. I am building
[yeetf.com](https://yeetf.com), a site for exploring investing what-ifs on real ASX ETF history (its
scenario tool is called Ranny), and that work provided the data and the modelling rules. This code is
separate from Ranny and standalone. It was written with the help of an AI assistant, which is one more
reason to check it.

## Licence

MIT, see [LICENSE](LICENSE). It covers the code, result tables and figures. The price data is not included
and is not covered.
