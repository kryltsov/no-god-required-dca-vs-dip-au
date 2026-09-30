# Data

The three `EXAMPLE_` files here show the format the code reads. **The values are invented.** They are not real prices.

Real data goes in `data/` (or wherever `DCA_DATA_DIR` points) as three files per fund, named by ticker:

| File | JSON array of | Fields the code uses |
|---|---|---|
| `VAS_eod.json` | one object per trading day, oldest first | `date` (YYYY-MM-DD), `high`, `low`, `close` (as traded), `adjusted_close` (total return: splits and distributions folded in) |
| `VAS_dividends.json` | one object per distribution | `date` (ex-date), `paymentDate` (rows without one are never paid), `unadjustedValue` (per unit, as paid) |
| `VAS_splits.json` | one object per split or consolidation, `[]` if none | `date`, `ratio` (new units per old unit: 2 for a 2-for-1) |

Extra fields are ignored. `close` steps at a split (units are multiplied instead); `adjusted_close` does not.
