# Findings index

Every number in prose comes from these generated files. Regenerate with the command at the top of
each. Rules and parameters were fixed in [`../README`](../README) before the first run.

| File | Experiment | Command |
|---|---|---|
| [`E01-single-vas.md`](E01-single-vas.md) | **Headline (realistic model).** VAS alone: DCA vs God vs 5 dip rules, cash parked in AAA and at 0% | `npx tsx src/run-experiment.ts single-vas` |
| [`E02-multi-asset.md`](E02-multi-asset.md) | **Headline (realistic model).** Stockspot Topaz (VAS 47.3%, IEM 20.9%, GOLD 12.3%, IOO 9.8%, IAF 9.7%): one pot vs a pot per asset, with and without a 12-month deadline | `npx tsx src/run-experiment.ts multi` |
| [`E03-signal-delay.md`](E03-signal-delay.md) | VAS alone, realistic model: the dip-buyer acts 1, 5, 22 or 44 trading days after the signal | `npx tsx src/run-experiment.ts lag` |
| [`E05-covid-split.md`](E05-covid-split.md) | Rolling 5-year windows split by whether they contain the Feb-Apr 2020 crash, by rule and delay | `npx tsx src/run-experiment.ts covid` |
| [`E06-rsi-episodes.md`](E06-rsi-episodes.md) | Every RSI(14) < 30 episode on VAS: what a 22-day delay would have paid | `npx tsx src/run-experiment.ts rsi-episodes` |
| [`E07-pot-per-fund.md`](E07-pot-per-fund.md) | Topaz portfolio, a pot per fund, against DCA run the same way (mix-neutral control) | `npx tsx src/run-experiment.ts sleeves` |
| [`E08-each-fund-alone.md`](E08-each-fund-alone.md) | Each of VAS, IOO, IEM, IAF, GOLD and AAA alone under DCA | `npx tsx src/run-experiment.ts funds` |
| [`E04-brokerage.md`](E04-brokerage.md) | VAS alone, realistic model: $0, $3 and $10 brokerage per buy (smallest trade $0, $300, $1,000) | `npx tsx src/run-experiment.ts fee` |
| [`../figures/`](../figures/) | Article charts: value over time with a dot at each buy, brokerage, gap to DCA | `npx tsx src/make-charts.ts` |
| [`E09-index.md`](E09-index.md), [`E09-allinone.md`](E09-allinone.md), [`E09-active.md`](E09-active.md) | The delay test on 20 other funds: 10 index ETFs, 4 diversified all-in-one ETFs, 6 actively managed ETFs | `npx tsx src/run-experiment.ts funds-index` (also `funds-allinone`, `funds-active`) |
| [`E01-single-vas-frictionless.md`](E01-single-vas-frictionless.md), [`E02-multi-asset-frictionless.md`](E02-multi-asset-frictionless.md) | First model, kept for comparison: total-return prices, free instant dividend reinvestment, no brokerage | same commands with `--frictionless` |

**Realistic model** (README, "The model"): as-traded prices, whole units, $3 brokerage per buy, smallest
trade $300 (brokerage at most 1%), dividends paid as cash on their pay dates into one pot with the
contributions, and the same buying rule for every strategy. Gain = final value (holdings at market
plus all cash) minus contributions, after brokerage. No tax or franking.

## First read (2026-09-29, AU period 2013-01 to 2025-11, includes COVID 2020 and the 2022 fall)

Ratio = final value divided by DCA's final value (1.000 = tie). Realistic model unless stated.

- **VAS alone, cash parked in AAA, full period.** DCA made **$62,687** (after $567 brokerage on 189
  buys). Every real-time rule made less: RSI $60,691 (0.986), Stochastic $62,458 (0.998), 50-day
  $61,532 (0.992), 200-day $59,808 (0.979), Bollinger $62,330 (0.997). God (hindsight) made $63,545
  (1.006). A lump sum on day one (reference only) made $156,213.
- **Brokerage did not rescue the dip-buyer.** The rules paid $51 to $249 in brokerage against DCA's
  $567, a saving of $300 to $500 over 12.9 years. That was less than what waiting cost them before brokerage, so every rule still finished behind (final values are after brokerage). Frictionless
  ratios were 0.986 to 0.997, realistic 0.979 to 0.998: the answer barely moved.
- **Rolling 5-year windows (95 starts):** median ratio 0.961 to 0.995 for the rules; a rule beat DCA
  in 1% (RSI) to 34% (Bollinger) of windows. **7-year (71 starts):** RSI beat DCA in 0, the 50-day
  rule in 2, the 200-day rule in 10, Stochastic in 13, Bollinger in 11. God: 45% of 5-year and 32%
  of 7-year windows.
- **Waiting is the cost:** RSI(14) < 30 fired about 5 times in a typical 5-year window and held
  about 39% of the money in cash on average.
- **Cash at 0% instead of AAA** widens the gap: full-period ratios 0.973 to 0.996 (God 1.001).
- **Topaz portfolio, one shared pot, full period:** DCA made $74,864 ($786 brokerage, 262 buys). The
  timers made $72,523 to $74,423 (0.985 to 0.997). God 1.006.

## Buys and cash left at the end

Every table has a **Buys** column (average per window; exact for the full period) and a **Cash at
end** column (median dollars still waiting, and its share of final value). Full period, VAS alone:
DCA 189 buys, $27 cash left; RSI 17 buys, $70; Stochastic 79 buys, $13; 50-day 83 buys, $590;
200-day 32 buys, $46; Bollinger 66 buys, $100. Over rolling 5-year windows the picture changes: RSI
ends with a median $5,472 (14.7% of the pot) still in cash, the 200-day rule $3,171 (8.7%), against
DCA's $42. Where a run ends decides how much cash is left over: a signal that has not fired by the
last day leaves that money uninvested.

## Signal delay (E03): the article's "miss the bottom" test does not carry over cleanly

Waiting 22 or 44 trading days after a signal **helped** RSI and the 200-day rule in this sample.
Full period, ratio to DCA at delays of 1, 5, 22 and 44 days: RSI 0.986, 0.985, **1.021, 1.011**;
200-day 0.979, 0.979, 0.994, 0.994; Stochastic 0.998, 0.998, 0.991, 0.998; 50-day 0.992, 0.988,
0.987, 0.999; Bollinger 0.997, 0.995, 0.999, 0.999. Rolling 5-year medians: RSI 0.977, 0.962, 1.013,
1.015, and it beat DCA in 63% and 72% of windows at 22 and 44 days.

**That result is one event (E05, E06).** Split the 95 five-year windows into the 57 that contain
the whole February-April 2020 crash and the 38 that do not: a month-late RSI beat DCA in 55 of 57
crash windows but 5 of 38 others; the month-late 200-day rule in 47 of 57 against 1 of 38. RSI first
fired on 27 February 2020; VAS then fell a further 31% at its low 17 trading days later, and a buyer
waiting 22 days paid 19.5% less than the next-day buyer. Of 23 RSI signals over the period, the
price 22 days later was higher on 15 and lower on 8 (three of the 8 are the 2020 crash). The
mirror image: without the crash, four of the five rules bought the next day finished level with DCA
at the median (1.000 to 1.005), and RSI at 0.986. The crash pulls prompt buyers behind and helps
late buyers. It is the reverse of Maggiulli's finding (US data, perfect foresight, a much longer
history) and the article says so plainly.

## Brokerage (E04): more brokerage narrows the gap, but does not close it

Ratio to DCA at $0, $3 and $10 brokerage (smallest trade none, $300, $1,000): RSI 0.979, 0.986,
0.988; Stochastic 0.994, 0.998, 0.993; 50-day 0.987, 0.992, 0.991; 200-day 0.973, 0.979, 0.982;
Bollinger 0.992, 0.997, **1.002**. DCA at $10 buys 90 times instead of 211 (it must wait to reach
$1,000) and pays $900 brokerage, against $567 at $3. The first case where a real-time rule finished
ahead of DCA over the full period is Bollinger at $10.

## E07 and E08: the fair test for a pot per fund (Topaz portfolio)

The portfolio is Stockspot's Topaz (High growth) from its fact sheet of 30 June 2026: VAS 47.3%,
IEM 20.9%, GOLD 12.3%, IOO 9.8%, IAF 9.7%. All five funds have history from 2012 or earlier, so no
substitutions were needed. Today's weights are applied to the whole period, without the real
portfolio's rebalancing or its fees.

E08, each fund alone, $500 a month, $77,500 put in: IOO made $178,806 ($2.31 per $1), GOLD $158,115
($2.04), VAS $62,687 ($0.81), IEM $52,117 ($0.67), AAA $13,351 ($0.17), IAF $9,197 ($0.12).

In E02, the pot-per-fund dip-buyers show 0.993 to 1.007 against one-pot DCA (Stochastic 1.007, 50-day
1.004, Bollinger 1.004, RSI 0.993, 200-day 0.994). **That is mostly an allocation effect.** They end
holding more of the funds that did well: about 15% IOO against DCA's 11%, 19% gold against 17%, and 5%
bonds against 8% (Stochastic row, "Median end mix" column).

E07 compares them with **DCA run the same way** (each fund's share of the money in its own pot), which
holds the same money per fund. That DCA made $76,563, against $74,864 for one-pot DCA, so how the money
is split into pots moved the result by $1,699, about as much as the one-pot dip rules cost ($441 to
$2,341). Against the fair baseline the dip-buyers finished at 0.982 (RSI), 0.996 (Stochastic), 0.993
(50-day), 0.983 (200-day) and 0.993 (Bollinger) over the full period. Rolling 5-year medians 0.979 to
0.998.

## E09: the delay test on 20 other funds

Each fund on its own, from 2013-01 or 14 months after its first trade if later (all-in-one funds from
2019-01, DHHF from 2021-02, so DHHF has no five-year runs and its test excludes the 2020 crash). 100
fund and rule combinations, each run over the fund's full period. Combinations that finished ahead of
DCA, at delays of 1, 5, 22 and 44 trading days: **12, 10, 26 and 19 of 100**. By group (of 50, 20 and
30): index ETFs 8, 8, 14, 13; all-in-one 0, 0, 7, 2; actively managed 4, 2, 5, 4. Median ratio 0.990
next day and 0.993 a month late. A month late, best 1.030 (RSI on STW), worst 0.872 (RSI on NDQ). On
NDQ, IVV and IOO no combination of rule and delay beat DCA. A month-late RSI finished ahead on IOZ,
STW, A200, VDHG, VDGR, VDBA and SWTZ, and level (1.000 to 1.001) on DHHF and IEM. (An earlier run of E09 had wrong start dates
for funds first traded in November or December; fixed, and every table regenerated.)

## Scope decision

Australian ETFs only (decided 2026-09-29). The US data pass is dropped, not postponed. That means
no 2008-09 and no 2000-02 in any result.

## Caveats to print beside every result

- One market, 12.9 years, one COVID crash and one 2022 fall. No 2008-09 or 2000-02.
- Rolling windows overlap heavily; "beats DCA" counts are not independent.
- The first contribution is 2013-01 (not 2012-03) so the 200-day average has data. IAF and AAA list
  from March 2012.
- Parking cash in AAA is modelled as earning AAA's total return with no brokerage to park or
  un-park. That flatters the dip-buyer, so it is the conservative choice for a finding that the
  dip-buyer loses.
- Pre-tax, no franking credits. A dividend row with no payment date is never paid (Ranny's rule):
  two IAF rows.
- Other funds are carried forward on VAS's non-trading days.
