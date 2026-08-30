/** Typed view over the generated lookup data (src/data/tables.json). */

import raw from '../data/tables.json'
import type { Curve } from './lookup'

interface Tables {
  constants: {
    baseNormalChances: number
    distLeft: number
    distCenter: number
    distRight: number
    distSetPiece: number
    distIfk: number
    pnfConv: number
    defaultPcExponent: number
    allOthersSplit: number
    sectorConvCap: number
    seBaseFreq: Record<string, number>
    seConvRow: Record<string, number>
  }
  approx: Record<string, Curve>
  exact: {
    pdimStopped: Record<string, number>
    pressingChancesRemoved: Record<string, number>
    pnfFreq: Record<string, number>
    caPctByDefenders: Record<string, number>
    caPctByLevel: Record<string, number>
    sePlayerFactor: Record<string, number>
    seCornerHeadFactor: Record<string, number>
    techDefCaBonus: Record<string, number>
    htsDef: Record<string, number>
    htsAtt: Record<string, number>
    htsMid: Record<string, number>
    htsLs: Record<string, number>
    lsDist: Record<string, { tactic: number; nonTactic: number }>
  }
  possessionLinear: number[]
  convKstars: { gkStars: number[]; rows: Record<string, number[]> }
  dfkPk: {
    attKeys: number[]
    defBreakpoints: number[]
    pk: number[][]
    dfk: number[][]
    pkShare: number[][]
  }
  htsWeights: Record<string, { side: number; middle: number }>
  htsn: {
    manmarking: Record<string, number>
    location: Record<string, number>
    extraTime: Record<string, number>
  }
}

export const T = raw as unknown as Tables
export const K = T.constants
