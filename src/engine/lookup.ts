/**
 * Excel lookup semantics, reproduced exactly.
 *
 * The workbook mixes approximate and exact lookups deliberately, so the two are
 * kept distinct here — substituting interpolation for an exact match would
 * silently change results.
 */

import type { Diagnostic } from './types'

export type Curve = [number, number][]

/** Collects the errors Excel would have shown as #N/A or #DIV/0!. */
export class Diagnostics {
  readonly items: Diagnostic[] = []

  error(field: string, message: string) {
    this.push('error', field, message)
  }

  warn(field: string, message: string) {
    this.push('warning', field, message)
  }

  private push(severity: Diagnostic['severity'], field: string, message: string) {
    if (this.items.some((d) => d.field === field && d.message === message)) return
    this.items.push({ severity, field, message })
  }
}

/**
 * VLOOKUP(..., TRUE): the value of the last row whose key is <= target.
 * Excel returns #N/A when the target is below the first key.
 */
export function approx(curve: Curve, target: number, field: string, diag: Diagnostics): number {
  if (!Number.isFinite(target)) {
    diag.error(field, 'Lookup key is not a number.')
    return 0
  }
  if (target < curve[0][0]) {
    diag.error(field, `Value ${target} is below the table's lowest key (${curve[0][0]}).`)
    return curve[0][1]
  }
  let lo = 0
  let hi = curve.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (curve[mid][0] <= target) lo = mid
    else hi = mid - 1
  }
  return curve[lo][1]
}

/** VLOOKUP(..., FALSE) over a numeric-keyed table. */
export function exact(
  table: Record<string, number>,
  key: number,
  field: string,
  diag: Diagnostics,
  fallback = 0,
): number {
  const k = numKey(key)
  const v = table[k]
  if (v === undefined) {
    diag.error(field, `No table entry for ${k}.`)
    return fallback
  }
  return v
}

/** VLOOKUP(..., FALSE) over a string-keyed table. */
export function exactStr(
  table: Record<string, number>,
  key: string,
  field: string,
  diag: Diagnostics,
  fallback = 0,
): number {
  const v = table[key]
  if (v === undefined) {
    diag.error(field, `No table entry for "${key}".`)
    return fallback
  }
  return v
}

/** Matches the key formatting used by tools/extract_tables.py. */
export function numKey(x: number): string {
  return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(10)))
}

/**
 * HLOOKUP(..., TRUE) against a row of ascending breakpoints, returning the
 * matched column index rather than a value.
 */
export function bucketIndex(breakpoints: number[], target: number): number {
  let i = 0
  while (i + 1 < breakpoints.length && breakpoints[i + 1] <= target) i++
  return i
}

/** VLOOKUP(..., TRUE) against a key column, returning the matched row index. */
export function approxIndex(keys: number[], target: number): number {
  let i = 0
  while (i + 1 < keys.length && keys[i + 1] <= target) i++
  return i
}

/** HLOOKUP(..., FALSE) against an exact header row. */
export function headerIndex(header: number[], target: number, field: string, diag: Diagnostics): number {
  const i = header.indexOf(target)
  if (i < 0) {
    diag.error(field, `${target} is not one of the allowed values (${header.join(', ')}).`)
    return -1
  }
  return i
}
