/**
 * Problem / recommendation copy for TrendChartCard: last point vs prior 7-day mean
 * (or vs all prior points when n < 8).
 */

export type TrendInsightMetric = 'occupancy' | 'revenue' | 'customers' | 'adr' | 'revpar' | 'avgTicket';
export type TrendInsightLocale = 'en' | 'th';

const PCT_THRESHOLD = 5;

function mean(nums: number[]): number {
  const ok = nums.filter((x) => Number.isFinite(x));
  if (!ok.length) return NaN;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

/** Last point vs mean of previous 7 daily points (or mean of all earlier points if n < 8). */
export function compareLastToPriorWeekTrend(values: number[]): {
  last: number;
  baseline: number;
  pctDiff: number;
} | null {
  const n = values.length;
  if (n < 2) return null;
  const last = values[n - 1]!;
  const baseline =
    n >= 8 ? mean(values.slice(n - 8, n - 1)) : mean(values.slice(0, n - 1));
  if (!Number.isFinite(baseline)) return null;
  if (baseline === 0) {
    if (last === 0) return { last, baseline: 0, pctDiff: 0 };
    return { last, baseline: 0, pctDiff: 100 };
  }
  const pctDiff = ((last - baseline) / baseline) * 100;
  return { last, baseline, pctDiff };
}

function directionFromPct(pctDiff: number): 'below' | 'above' | 'inline' {
  if (pctDiff < -PCT_THRESHOLD) return 'below';
  if (pctDiff > PCT_THRESHOLD) return 'above';
  return 'inline';
}

function metricLabel(metric: TrendInsightMetric, loc: TrendInsightLocale): string {
  const m: Record<TrendInsightMetric, { en: string; th: string }> = {
    occupancy: { en: 'Occupancy', th: 'อัตราการเข้าพัก' },
    revenue: { en: 'Revenue', th: 'รายได้' },
    customers: { en: 'Customers', th: 'จำนวนลูกค้า' },
    adr: { en: 'ADR', th: 'ราคาห้องเฉลี่ย' },
    revpar: { en: 'RevPAR', th: 'รายได้ต่อห้อง' },
    avgTicket: { en: 'Avg ticket', th: 'ค่าเฉลี่ยต่อบิล' },
  };
  return loc === 'th' ? m[metric].th : m[metric].en;
}

function problemPhrase(
  metric: TrendInsightMetric,
  dir: 'below' | 'above' | 'inline',
  loc: TrendInsightLocale
): string {
  const name = metricLabel(metric, loc);
  if (loc === 'th') {
    if (dir === 'below') return `${name} ต่ำกว่าค่าเฉลี่ย 7 วัน`;
    if (dir === 'above') return `${name} สูงกว่าค่าเฉลี่ย 7 วัน`;
    return `${name} ใกล้เคียงค่าเฉลี่ย 7 วัน`;
  }
  if (dir === 'below') return `${name} trending below 7-day average`;
  if (dir === 'above') return `${name} trending above 7-day average`;
  return `${name} in line with 7-day average`;
}

function recommendForBelow(metric: TrendInsightMetric, loc: TrendInsightLocale): string {
  const R: Record<TrendInsightMetric, { en: string; th: string }> = {
    occupancy: {
      en: 'Run weekday promotions or packages to lift occupancy toward the 7-day average.',
      th: 'จัดโปรโมชั่นหรือแพ็กเกจวันธรรมดาเพื่อดันอัตราการเข้าพักให้ใกล้ค่าเฉลี่ย 7 วัน',
    },
    revenue: {
      en: 'Launch bundles or targeted offers to recover revenue vs the 7-day trend.',
      th: 'เปิดแพ็กเกจหรือข้อเสนอเฉพาะกลุ่มเพื่อดันรายได้ให้กลับมาเทียบแนว 7 วัน',
    },
    customers: {
      en: 'Drive traffic with a time-limited weekday promo or local push.',
      th: 'ดึงลูกค้าด้วยโปรจำกัดเวลาช่วงวันธรรมดาหรือการตลาดใกล้เคียง',
    },
    adr: {
      en: 'Test modest rate lifts or upsells on high-demand nights to lift ADR.',
      th: 'ทดลองปรับราคาเล็กน้อยหรืออัปเซลล์คืนที่ดีมานด์สูงเพื่อดันราคาห้องเฉลี่ย',
    },
    revpar: {
      en: 'Focus on whichever lags—occupancy fill or ADR—to pull RevPAR back toward the week trend.',
      th: 'โฟกัสด้านที่แพ้—อัตราเข้าพักหรือราคา—เพื่อดันรายได้ต่อห้องให้กลับมาใกล้แนว 7 วัน',
    },
    avgTicket: {
      en: 'Train upsells and feature higher-ticket items to raise average spend.',
      th: 'ฝึกอัปเซลล์และดันเมนูมูลค่าสูงเพื่อยกค่าเฉลี่ยต่อบิล',
    },
  };
  return loc === 'th' ? R[metric].th : R[metric].en;
}

function recommendForAbove(metric: TrendInsightMetric, loc: TrendInsightLocale): string {
  const R: Record<TrendInsightMetric, { en: string; th: string }> = {
    occupancy: {
      en: 'Maintain pricing and distribution discipline while demand stays above the week trend.',
      th: 'รักษามาตรฐานราคาและช่องทางจำหน่ายขณะดีมานสูงกว่าแนว 7 วัน',
    },
    revenue: {
      en: 'Protect margins and capacity—revenue is above the 7-day trend.',
      th: 'รักษามาร์จิ้นและความจุ—รายได้สูงกว่าแนว 7 วัน',
    },
    customers: {
      en: 'Keep service quality tight and prep staffing for sustained traffic above the week average.',
      th: 'คุมคุณภาพบริการและเตรียมคนรองรับลูกค้าที่สูงกว่าค่าเฉลี่ย 7 วัน',
    },
    adr: {
      en: 'Hold rate integrity; ADR is outperforming the recent week—avoid unnecessary discounting.',
      th: 'รักษาระดับราคา—ราคาห้องเฉลี่ยดีกว่าแนว 7 วัน—เลี่ยงลดราคาเกินจำเป็น',
    },
    revpar: {
      en: 'Double down on what’s working—RevPAR is above the 7-day average.',
      th: 'ทำซ้ำสิ่งที่ได้ผล—รายได้ต่อห้องสูงกว่าค่าเฉลี่ย 7 วัน',
    },
    avgTicket: {
      en: 'Reinforce combos and premium items; avg ticket is above the week trend.',
      th: 'เสริมเซ็ตและเมนูพรีเมียม—ค่าเฉลี่ยต่อบิลสูงกว่าแนว 7 วัน',
    },
  };
  return loc === 'th' ? R[metric].th : R[metric].en;
}

function mergeRecommendations(
  items: { metric: TrendInsightMetric; dir: 'below' | 'above' | 'inline' }[],
  loc: TrendInsightLocale
): string {
  if (!items.length) {
    return loc === 'th'
      ? 'ติดตามแนวโน้มรายวันต่อเนื่อง'
      : 'Keep logging daily metrics for a clearer 7-day read.';
  }
  const below = items.filter((i) => i.dir === 'below');
  if (below.length) {
    const parts = below.slice(0, 2).map((i) => recommendForBelow(i.metric, loc));
    return parts.join(loc === 'th' ? ' ' : ' ');
  }
  const above = items.filter((i) => i.dir === 'above');
  if (above.length) {
    return recommendForAbove(above[0]!.metric, loc);
  }
  return loc === 'th'
    ? 'ถือแนวทางเดิม—ทั้งสองชุดข้อมูลใกล้ค่าเฉลี่ย 7 วัน'
    : 'Hold course—metrics are close to the 7-day average.';
}

export function trendInsightFromSeries(
  values: number[],
  metric: TrendInsightMetric,
  loc: TrendInsightLocale
): { problem: string; recommendation: string } {
  const cmp = compareLastToPriorWeekTrend(values);
  if (!cmp) {
    return {
      problem:
        loc === 'th'
          ? 'ยังเปรียบเทียบแนว 7 วันไม่ได้—ข้อมูลไม่พอหรือไม่เสถียร'
          : 'Not enough data for a reliable 7-day comparison yet.',
      recommendation:
        loc === 'th'
          ? 'สะสมข้อมูลรายวันต่อเนื่องแล้วกลับมาดูใหม่'
          : 'Keep logging daily metrics; the 7-day read will sharpen in a few days.',
    };
  }
  const dir = directionFromPct(cmp.pctDiff);
  return {
    problem: problemPhrase(metric, dir, loc),
    recommendation:
      dir === 'below'
        ? recommendForBelow(metric, loc)
        : dir === 'above'
          ? recommendForAbove(metric, loc)
          : loc === 'th'
            ? 'ติดตามต่อ—ค่าปัจจุบันใกล้ค่าเฉลี่ย 7 วัน'
            : 'Keep monitoring—current level matches the recent week trend.',
  };
}

export function trendInsightDual(
  primary: { values: number[]; metric: TrendInsightMetric },
  secondary: { values: number[]; metric: TrendInsightMetric } | null,
  loc: TrendInsightLocale
): { problem: string; recommendation: string } {
  const pCmp = compareLastToPriorWeekTrend(primary.values);
  const sCmp = secondary ? compareLastToPriorWeekTrend(secondary.values) : null;

  if (!pCmp && !sCmp) {
    return trendInsightFromSeries(primary.values, primary.metric, loc);
  }

  const pDir = pCmp ? directionFromPct(pCmp.pctDiff) : null;
  const sDir = sCmp ? directionFromPct(sCmp.pctDiff) : null;

  const problemParts: string[] = [];
  if (pCmp && pDir) problemParts.push(problemPhrase(primary.metric, pDir, loc));
  if (sCmp && sDir) problemParts.push(problemPhrase(secondary!.metric, sDir, loc));

  if (problemParts.length === 0) {
    return trendInsightFromSeries(primary.values, primary.metric, loc);
  }

  const problem = problemParts.join(loc === 'th' ? ' · ' : ' · ');

  const states: { metric: TrendInsightMetric; dir: 'below' | 'above' | 'inline' }[] = [];
  if (pDir) states.push({ metric: primary.metric, dir: pDir });
  if (sDir) states.push({ metric: secondary!.metric, dir: sDir });

  const recommendation = mergeRecommendations(states, loc);

  return { problem, recommendation };
}
