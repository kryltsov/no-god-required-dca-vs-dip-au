"""
Builds the five-minute "dip checker" workbook described in the article "Putting it together".

  python3 src/spreadsheet/build_template.py <out.xlsx> [test-series.json]

Without a series file: the "Prices" sheet holds one GOOGLEFINANCE formula (Google Sheets fills it
with a table: Date, Open, High, Low, Close, Volume) and the "Dip check" sheet works the five rules
out from it. With a series file (from export-test-series.ts): static prices in the same layout,
used only to check the formulas against the simulator's indicator code (verify_template.py).
The distributed template never contains price data.
"""
import json, sys
from openpyxl import Workbook

ROWS = 400  # rows 2..401 of formulas
out = sys.argv[1]
series = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None

wb = Workbook()
prices = wb.active
prices.title = "Prices"
if series:
    prices.append(["Date", "Open", "High", "Low", "Close", "Volume"])
    for i, d in enumerate(series["dates"]):
        prices.append([d, None, series["high"][i], series["low"][i], series["close"][i], None])
else:
    prices["A1"] = '=GOOGLEFINANCE("ASX:VAS","all",TODAY()-620,TODAY())'
    prices["H1"] = "Change ASX:VAS to your fund (for example ASX:VGS). Google Sheets fills columns A to F."

ws = wb.create_sheet("Dip check")
ws.append([
    "Date", "Close", "High", "Low", "50-day avg", "200-day avg", "Bollinger lower band",
    "Gain", "Loss", "Avg gain (14)", "Avg loss (14)", "RSI (14)", "Stoch raw %K", "Stoch %K (3)",
    "RSI < 30", "Stochastic < 20", "50-day pullback", "200-day pullback", "Below Bollinger", "Any signal today?",
])
last = ROWS + 1
for r in range(2, last + 1):
    p = f"Prices!"
    row = {}
    row["A"] = f'=IF({p}A{r}="","",{p}A{r})'
    row["B"] = f'=IF({p}E{r}="","",{p}E{r})'
    row["C"] = f'=IF({p}C{r}="","",{p}C{r})'
    row["D"] = f'=IF({p}D{r}="","",{p}D{r})'
    row["E"] = f"=AVERAGE(B{r-49}:B{r})" if r >= 51 else ""
    row["F"] = f"=AVERAGE(B{r-199}:B{r})" if r >= 201 else ""
    row["G"] = f"=AVERAGE(B{r-19}:B{r})-2*STDEV.P(B{r-19}:B{r})" if r >= 21 else ""
    row["H"] = f"=MAX(B{r}-B{r-1},0)" if r >= 3 else ""
    row["I"] = f"=MAX(B{r-1}-B{r},0)" if r >= 3 else ""
    if r == 16:
        row["J"] = "=AVERAGE(H3:H16)"
        row["K"] = "=AVERAGE(I3:I16)"
    elif r > 16:
        row["J"] = f"=(J{r-1}*13+H{r})/14"
        row["K"] = f"=(K{r-1}*13+I{r})/14"
    else:
        row["J"] = row["K"] = ""
    row["L"] = f"=IF(K{r}=0,100,100-100/(1+J{r}/K{r}))" if r >= 16 else ""
    row["M"] = (
        f"=IF(MAX(C{r-13}:C{r})=MIN(D{r-13}:D{r}),50,100*(B{r}-MIN(D{r-13}:D{r}))/(MAX(C{r-13}:C{r})-MIN(D{r-13}:D{r})))"
        if r >= 15 else ""
    )
    row["N"] = f"=AVERAGE(M{r-2}:M{r})" if r >= 17 else ""
    row["O"] = f"=IF(ISNUMBER(L{r}),L{r}<30,FALSE)"
    row["P"] = f"=IF(ISNUMBER(N{r}),N{r}<20,FALSE)"
    row["Q"] = (
        f"=IF(AND(ISNUMBER(E{r-20}),ISNUMBER(E{r})),AND(E{r}>E{r-20},B{r}<=E{r}*1.01,B{r-1}>E{r-1}*1.01),FALSE)"
        if r >= 71 else "=FALSE"
    )
    row["R"] = (
        f"=IF(AND(ISNUMBER(F{r-20}),ISNUMBER(F{r})),AND(F{r}>F{r-20},B{r}<=F{r}*1.01,B{r-1}>F{r-1}*1.01),FALSE)"
        if r >= 221 else "=FALSE"
    )
    row["S"] = f"=IF(ISNUMBER(G{r}),B{r}<G{r},FALSE)"
    row["T"] = f"=OR(O{r},P{r},Q{r},R{r},S{r})"
    ws.append([row[c] for c in "ABCDEFGHIJKLMNOPQRST"])

# the five-minute summary
ws["V1"] = "Latest date"
ws["W1"] = f"=INDEX(A2:A{last},COUNT(B2:B{last}))"
ws["V2"] = "Latest close"
ws["W2"] = f"=INDEX(B2:B{last},COUNT(B2:B{last}))"
for i, (label, col) in enumerate([("RSI < 30", "O"), ("Stochastic < 20", "P"), ("50-day pullback", "Q"),
                                  ("200-day pullback", "R"), ("Below Bollinger band", "S"), ("Any signal today?", "T")]):
    ws[f"V{3+i}"] = label
    ws[f"W{3+i}"] = f"=INDEX({col}2:{col}{last},COUNT(B2:B{last}))"
ws["V10"] = "A signal is read after the close and acted on the next trading day. Educational only, not advice."
wb.save(out)
