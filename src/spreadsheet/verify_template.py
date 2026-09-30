"""
Checks the dip-checker workbook's formulas against the simulator's own indicator values.

  npx tsx src/spreadsheet/export-test-series.ts series.json
  python3 src/spreadsheet/build_template.py test.xlsx series.json
  python3 src/spreadsheet/verify_template.py test.xlsx series.json

Needs `pip install formulas openpyxl`. This evaluates the formulas with the `formulas` Python engine,
not with Google Sheets itself, so it proves the arithmetic, not Sheets' handling of GOOGLEFINANCE.
"""
import json, sys, os, formulas

book, series_file = sys.argv[1], sys.argv[2]
sol = formulas.ExcelModel().loads(book).finish().calculate()
name = os.path.basename(book).upper()
series = json.load(open(series_file))

def val(cell):
    try:
        return sol[f"'[{name.lower()}]DIP CHECK'!{cell}"].value[0, 0]
    except KeyError:
        return None

bad = 0
for r in range(2, 402):
    i = r - 2
    for col, key in [("L", "rsi"), ("N", "stoch"), ("E", "sma50"), ("F", "sma200"), ("G", "bbLower")]:
        exp = series[key][i]
        if exp is None:
            continue
        v = val(f"{col}{r}")
        if not isinstance(v, (int, float)) or abs(v - exp) > 1e-6 * max(1, abs(exp)):
            bad += 1
            if bad < 10: print("VALUE MISMATCH", r, col, v, exp)
    for col, rule in {"O": "rsi", "P": "stoch", "Q": "ma50", "R": "ma200", "S": "bollinger"}.items():
        if bool(val(f"{col}{r}")) != series["level"][rule][i]:
            bad += 1
            if bad < 10: print("FLAG MISMATCH", r, col, val(f"{col}{r}"), series["level"][rule][i])
last_close, last_flag = val("W2"), val("W8")
assert abs(last_close - series["close"][-1]) < 1e-9, ("latest close", last_close)
assert bool(last_flag) == any(series["level"][k][-1] for k in series["level"]), "latest any-signal"
print("rows checked: 400; mismatches:", bad)
sys.exit(1 if bad else 0)
