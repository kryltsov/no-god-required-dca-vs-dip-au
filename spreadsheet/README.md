# Dip checker (spreadsheet template)

`dip-checker-template.xlsx` is the five-minute spreadsheet described in the last article of the series. It has **no price
data in it**. Import it into Google Sheets (File > Import > Upload, replace the spreadsheet).

- **Sheet "Prices":** one formula, `=GOOGLEFINANCE("ASX:VAS","all",TODAY()-620,TODAY())`, which Google
  Sheets fills with Date, Open, High, Low, Close, Volume. Change `ASX:VAS` to your fund.
- **Sheet "Dip check":** the 50 and 200-day averages, the Bollinger lower band, RSI(14) and the
  Stochastic, then one TRUE/FALSE column per rule and a summary in `V1:W8` showing today's state.

The five rules are the ones in [`the article "The game and its rules"`](the article "The game and its rules").

## What has and has not been checked

- **Checked:** the formulas reproduce the simulator's indicator values (RSI, Stochastic, both
  averages, the Bollinger band) and all five true/false flags on 400 rows of VAS data, with no
  mismatches (`src/spreadsheet/verify_template.py`). That check evaluated the
  formulas with a Python formula engine, not with Google Sheets itself.
- **Not checked:** how `GOOGLEFINANCE` behaves for a given ASX ETF (coverage and data gaps vary), and
  whether the data Google returns is complete for your fund.
- **Known difference:** the experiments used dividend-adjusted closes. `GOOGLEFINANCE` returns the
  traded price, which drops on ex-dividend days, so an RSI or band computed from it will differ a
  little.
- Rebuild with `python3 src/spreadsheet/build_template.py <out.xlsx>`.
