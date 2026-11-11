/**
 * Federal payroll figures by tax year. Add a year each January from IRS
 * Publication 15-T (withholding tables) and the IRS's annual limit notices.
 */

export type FilingStatus = "single" | "married_jointly" | "head_of_household"

/** One row of an annual percentage-method table, in dollars. */
export interface WithholdingRow {
  /** The row applies to adjusted annual wages at least this much. */
  atLeast: number
  /** The tentative amount to withhold at `atLeast`. */
  base: number
  rate: number
}

export interface TaxYear {
  year: number
  /**
   * Pub 15-T annual percentage-method tables for 2020-or-later Forms W-4:
   * `standard` when the Step 2 box isn't checked, `checkbox` when it is.
   */
  withholding: Record<
    FilingStatus,
    { standard: WithholdingRow[]; checkbox: WithholdingRow[] }
  >
  /** Worksheet 1A line 1g, subtracted when the Step 2 box isn't checked. */
  line1g: Record<FilingStatus, number>
  /** Flat federal withholding on supplemental wages like bonuses. */
  supplementalRate: number
  /** Supplemental wages above this in a year are withheld at the top rate. */
  supplementalHighThreshold: number
  supplementalHighRate: number
  socialSecurityRate: number
  socialSecurityWageBase: number
  medicareRate: number
  /** Extra Medicare withheld on an employer's wages above the threshold. */
  additionalMedicareRate: number
  additionalMedicareThreshold: number
  /** Employee 401(k), 403(b), and Roth 401(k) deferrals, combined. */
  electiveDeferralLimit: number
  /** Extra deferrals allowed from age 50. */
  catchUpLimit: number
  /** The catch-up allowed at ages 60 through 63, instead of `catchUpLimit`. */
  superCatchUpLimit: number
  /** Governmental 457(b) deferrals, a separate limit. */
  deferral457Limit: number
  hsaLimit: { self: number; family: number }
  /** Extra HSA contributions allowed from age 55. */
  hsaCatchUp: number
}

const rows = (table: [number, number, number][]): WithholdingRow[] =>
  table.map(([atLeast, base, rate]) => ({ atLeast, base, rate }))

/** 2026: Publication 15-T (2026), and the IRS's 2026 limits. */
const TAX_YEAR_2026: TaxYear = {
  year: 2026,
  withholding: {
    married_jointly: {
      standard: rows([
        [0, 0, 0],
        [19_300, 0, 0.1],
        [44_100, 2_480, 0.12],
        [120_100, 11_600, 0.22],
        [230_700, 35_932, 0.24],
        [422_850, 82_048, 0.32],
        [531_750, 116_896, 0.35],
        [788_000, 206_583.5, 0.37],
      ]),
      checkbox: rows([
        [0, 0, 0],
        [16_100, 0, 0.1],
        [28_500, 1_240, 0.12],
        [66_500, 5_800, 0.22],
        [121_800, 17_966, 0.24],
        [217_875, 41_024, 0.32],
        [272_325, 58_448, 0.35],
        [400_450, 103_291.75, 0.37],
      ]),
    },
    single: {
      standard: rows([
        [0, 0, 0],
        [7_500, 0, 0.1],
        [19_900, 1_240, 0.12],
        [57_900, 5_800, 0.22],
        [113_200, 17_966, 0.24],
        [209_275, 41_024, 0.32],
        [263_725, 58_448, 0.35],
        [648_100, 192_979.25, 0.37],
      ]),
      checkbox: rows([
        [0, 0, 0],
        [8_050, 0, 0.1],
        [14_250, 620, 0.12],
        [33_250, 2_900, 0.22],
        [60_900, 8_983, 0.24],
        [108_938, 20_512, 0.32],
        [136_163, 29_224, 0.35],
        [328_350, 96_489.63, 0.37],
      ]),
    },
    head_of_household: {
      standard: rows([
        [0, 0, 0],
        [15_550, 0, 0.1],
        [33_250, 1_770, 0.12],
        [83_000, 7_740, 0.22],
        [121_250, 16_155, 0.24],
        [217_300, 39_207, 0.32],
        [271_750, 56_631, 0.35],
        [656_150, 191_171, 0.37],
      ]),
      checkbox: rows([
        [0, 0, 0],
        [12_075, 0, 0.1],
        [20_925, 885, 0.12],
        [45_800, 3_870, 0.22],
        [64_925, 8_077.5, 0.24],
        [112_950, 19_603.5, 0.32],
        [140_175, 28_315.5, 0.35],
        [332_375, 95_585.5, 0.37],
      ]),
    },
  },
  line1g: { married_jointly: 12_900, single: 8_600, head_of_household: 8_600 },
  supplementalRate: 0.22,
  supplementalHighThreshold: 1_000_000,
  supplementalHighRate: 0.37,
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 184_500,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: 200_000,
  electiveDeferralLimit: 24_500,
  catchUpLimit: 8_000,
  superCatchUpLimit: 11_250,
  deferral457Limit: 24_500,
  hsaLimit: { self: 4_400, family: 8_750 },
  hsaCatchUp: 1_000,
}

export const TAX_YEARS: Record<number, TaxYear> = { 2026: TAX_YEAR_2026 }

export const LATEST_TAX_YEAR = Math.max(...Object.keys(TAX_YEARS).map(Number))

/** The figures for `year`, or the latest ones the app has when it's newer. */
export function taxYear(year: number): { figures: TaxYear; current: boolean } {
  const figures =
    TAX_YEARS[year] ??
    TAX_YEARS[Math.min(year, LATEST_TAX_YEAR)] ??
    TAX_YEARS[LATEST_TAX_YEAR]
  return { figures, current: figures.year === year }
}
