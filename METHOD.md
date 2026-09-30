# Method: exactly how the trades and numbers are made

This page is for a reader who is not convinced and wants to check. It describes what the code in
`src/` does, in the order it does it. If this page and the code disagree, the code is right and this
page is wrong, so please tell us. Educational modelling of historical scenarios, not advice.

## 1. The data

Per fund, three JSON files (format and invented samples in `data/`):

- `..._eod.json`: one row per trading day with `open, high, low, close, adjusted_close, volume`.
  `close` is the price as traded, and steps at a split. `adjusted_close` is a total-return series
  (splits and distributions folded in) supplied by the vendor. **Opens are never used anywhere.**
- `..._dividends.json`: ex-date, payment date and the amount per unit as paid (`unadjustedValue`).
- `..._splits.json`: date and ratio (new units per old unit).

The price data is from a commercial vendor and is not in this repository. Dates run to 2025-11-28.

## 2. What price each thing uses

| Thing | Price used |
|---|---|
| Every buy, at any fee | The **as-traded close** of the day the order executes. No spread, no slippage, no partial fills |
| The value of holdings on any day | As-traded close times units |
| RSI, both moving averages, Bollinger band | **Adjusted close** |
| Stochastic | Adjusted close, and adjusted high and low (the day's high and low scaled by adjusted close / close) |
| Cash waiting in the cash ETF (AAA) | AAA's adjusted close (its total return) |

## 3. When a signal becomes a trade

A signal is computed from rows up to and including day *k* (no later data). The buy executes at the
close of day *k + 1* (one trading day later; article 2 tests 5, 22 and 44 days). A person who reads a
spreadsheet after the close would in practice order the next morning and fill near the next open;
the model fills at the next close instead. Fills at the open were not tested.

A signal "fires" on the **first day of an episode**: the row where the condition is true and the row
before was not. Then the dip-buyer spends **all** the cash in the pot (if it is at least the minimum
trade, section 5). The "any day in dip" variant (E01) fires on every day the condition holds.

## 4. The indicators, exactly

All periods count trading rows. `SMA(n)` is the mean of the last n closes.

- **RSI(14), Wilder.** Average gain and loss over the first 14 changes, then
  `avg = (avg_prev * 13 + today) / 14`. `RSI = 100 - 100 / (1 + avg gain / avg loss)`. Fires when
  RSI < 30.
- **Stochastic (14, 3).** Raw %K = `100 * (close - lowest low(14)) / (highest high(14) - lowest low(14))`;
  slow %K is the 3-day mean of raw %K. Fires when slow %K < 20.
- **Pullback to a rising average (50 and 200).** The average is "rising" when `SMA_t > SMA_(t-20)`.
  Fires when it is rising, `close_t <= 1.01 * SMA_t` and `close_(t-1) > 1.01 * SMA_(t-1)`. That is a fresh
  touch of the line from above, not drift sitting on it.
- **Bollinger (20, 2).** Lower band = `SMA(20) - 2 * population standard deviation(20)`. Fires when
  `close < lower band`.
- **God (hindsight benchmark, from Maggiulli).** Within the run, all-time highs are found from the first
  day; between each pair of consecutive highs, the lowest close is a "dip"; everything saved is bought at
  each dip. The unfinished fall after the last high has no dip. It cannot be used in real life.

Standard settings, fixed before any result was seen and never tuned. Warm-up rows produce no signals.

## 5. Contributions, dividends, splits and the day's order of events

Each day, in this order:

1. **Splits.** Units are multiplied by the ratio. The price steps; the value does not.
2. **Ex-dividend.** The units held at the start of the day (before today's buys) are entitled.
3. **Dividends paid.** On the first trading day on or after the payment date, entitled units times the
   per-unit amount goes into the pot as cash. A dividend row with no payment date is never paid.
4. **Contribution.** $500 on the first trading day of each month goes into the pot.
5. **Buying rule** (below).
6. Bookkeeping (portfolio value, cash held).

**Splits we met.** Since 2013, among the funds tested: IOO 2-for-1 (1 May 2018), GOLD 10-for-1
(8 June 2022), IVV 15-for-1 (7 December 2022; the vendor's ratio is 15.00015, so units become very
slightly fractional). We checked the simulator's portfolio value across each: no jump beyond the
market's own move (IOO's day also carried a $500 contribution). No dividend had an ex-date before and a
payment date after any of these splits, so the rule that entitlements are not rescaled across a split
never came into play.

**Buying rule, the same for every strategy.** The smallest trade is `fee / 1%`: $300 at $3 brokerage, $0
at $0, $1,000 at $10. If the pot is below that, nothing is bought and the cash waits.
- **DCA** tries to deploy the pot every day it changes (contribution or dividend), so it buys when the
  pot first reaches the minimum.
- **A dip-buyer** deploys the pot only on a day its signal has fired (and the minimum is met).
- **Deploying** repeats: pick the holding furthest below its target weight (target value =
  weight x (holdings + cash still to spend)); the slice is the smaller of the cash left and the larger of
  that gap and the minimum trade; whole units = `floor((slice - fee) / close)`; cost = units x close + fee;
  repeat while cash left is at least the minimum and a whole unit is affordable. Change stays in the pot.

With one fund this is one buy of the whole pot. With a pot per fund (E07) each fund has its own pot and
the same rule runs per pot. A 12-month deadline variant (E02) also deploys any pot whose oldest cash is a
year old.

## 6. Cash and brokerage

Idle cash is held as units of the cash ETF AAA, bought and sold at AAA's adjusted close, so it earns AAA's
total return. There is **no brokerage to move money in or out of AAA**, which flatters the dip-buyer. Every
buy of a fund pays the brokerage ($3 unless stated), taken out of the pot.

## 7. The result

Final value = units x last as-traded close + the pot valued at AAA's adjusted close. Gain = final value -
contributions. Brokerage has already been paid out of the pot, and dividends are in it. "Vs DCA" = final
value divided by DCA's final value in the same run. Runs: one full run from the first contribution to
2025-11-28, plus every 5 or 7-year stretch starting in each month (neighbouring runs share almost all their
months, so they are not independent experiments).

## 8. What is not modelled, and where the model is loose

- **Tax, franking credits, platform fees** and management fees beyond those already inside ETF prices.
- **Spread and slippage.** Fills are at the close.
- **Fills at the open.** A next-morning order would fill near the next open; not tested.
- **Thin trading.** Every row is treated as tradeable, including days with zero volume and an unchanged
  price. For the Topaz funds that is negligible (IAF 2 rows, AAA 1 since 2013). For thinly traded active
  ETFs in article 2 it is not: since 2013, MHG has 118 such rows, GROW 189, MOGL 82 and SWTZ 33. On those
  days the model can fill at a stale price. Ranny's engine excludes such days; this code does not. The
  effect was not measured.
- **Look-ahead through adjusted prices.** Past adjusted closes are scaled by later dividends, so a signal
  built on them uses a little information from after the day. We re-ran the VAS full-period results with
  signals built from as-traded prices: ratios to DCA moved by 0.6 points or less, in no consistent
  direction (RSI 0.986 to 0.992, Stochastic 0.998 to 0.998, 50-day 0.992 to 0.990, 200-day 0.979 to 0.973,
  Bollinger 0.997 to 1.000).
- **Other funds on the calendar fund's days.** In a multi-fund run, the shared calendar is VAS's trading
  days and other funds are carried forward on days they did not trade.
- **The Topaz weights** are those published on the fact sheet dated 30 June 2026, applied to the whole
  period without rebalancing or Stockspot's fees.
- **An investor who follows the rule exactly** and checks every day.

## 9. How to check

`npm test` covers the indicator arithmetic and the simulator's bookkeeping (whole units, brokerage,
minimum trade, dividends, splits) on synthetic data, with no price data needed. The spreadsheet template's
formulas are checked against the same indicator code (`src/spreadsheet/`). To repeat an experiment, supply
files in the format described in `data/README.md` and run the commands in the README.
