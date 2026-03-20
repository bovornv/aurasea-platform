'use client';

import { useMemo, type CSSProperties } from 'react';
import { businessGroupService } from '../../services/business-group-service';
import { operationalSignalsService } from '../../services/operational-signals-service';
import { ModuleType } from '../../models/business-group';
import type { BranchHealthScore } from '../../services/health-score-service';
import { formatCurrency } from '../../utils/formatting';

function healthColor(score: number | null): string {
  if (score == null || isNaN(score)) return '#6b7280';
  if (score <= 60) return '#b91c1c';
  if (score <= 80) return '#ca8a04';
  return '#15803d';
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};
const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #e5e7eb',
  color: '#64748b',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid #f1f5f9',
  color: '#0f172a',
};

interface Props {
  businessGroupId: string;
  branchScores: BranchHealthScore[];
  refreshKey?: number;
}

export function CompanyBusinessStatusTables({ businessGroupId, branchScores, refreshKey = 0 }: Props) {
  const scoreByBranch = useMemo(() => {
    const m = new Map<string, BranchHealthScore>();
    branchScores.forEach((s) => m.set(s.branchId, s));
    return m;
  }, [branchScores]);

  const { accommodationRows, fnbRows } = useMemo(() => {
    void refreshKey;
    const branches = businessGroupService
      .getAllBranches()
      .filter((b) => b.businessGroupId === businessGroupId);

    type AccRow = {
      branchId: string;
      branchName: string;
      health: number | null;
      occ: number;
      revenue: number;
      adr: number;
      roomsSold: number;
      roomsTotal: number;
      revpar: number;
    };
    type FnbRow = {
      branchId: string;
      branchName: string;
      health: number | null;
      revenue: number;
      customers: number;
      avgTicket: number;
    };

    const acc: AccRow[] = [];
    const fnb: FnbRow[] = [];

    for (const br of branches) {
      const mods = br.modules ?? [];
      const metrics = operationalSignalsService.getLatestMetrics(
        br.id,
        businessGroupId,
        mods.map((m) => String(m))
      );
      const sc = scoreByBranch.get(br.id);
      const health = sc?.healthScore ?? null;

      if (mods.includes(ModuleType.ACCOMMODATION) && metrics?.modules?.accommodation) {
        const a = metrics.modules.accommodation;
        const occ = a.occupancyRateLast30DaysPct ?? 0;
        const total = a.totalRoomsAvailable ?? 0;
        const rev = metrics.financials?.revenueLast30DaysTHB ?? 0;
        const adr = a.averageDailyRoomRateTHB ?? 0;
        const roomsSold = total > 0 ? Math.round((occ / 100) * total) : 0;
        const revpar =
          total > 0 ? rev / (30 * total) : adr > 0 && occ > 0 ? (adr * occ) / 100 : 0;
        acc.push({
          branchId: br.id,
          branchName: br.branchName || br.id,
          health,
          occ,
          revenue: rev,
          adr,
          roomsSold,
          roomsTotal: total,
          revpar,
        });
      }

      if (mods.includes(ModuleType.FNB) && metrics?.modules?.fnb) {
        const f = metrics.modules.fnb;
        fnb.push({
          branchId: br.id,
          branchName: br.branchName || br.id,
          health,
          revenue: metrics.financials?.revenueLast30DaysTHB ?? 0,
          customers: f.totalCustomersLast7Days ?? 0,
          avgTicket: f.averageTicketPerCustomerTHB ?? 0,
        });
      }
    }

    acc.sort((x, y) => {
      const hx = x.health ?? 999;
      const hy = y.health ?? 999;
      return hx - hy;
    });
    fnb.sort((x, y) => {
      const hx = x.health ?? 999;
      const hy = y.health ?? 999;
      return hx - hy;
    });

    return { accommodationRows: acc, fnbRows: fnb };
  }, [businessGroupId, scoreByBranch, refreshKey]);

  const subTitle = (label: string) => (
    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '1rem 0 0.5rem' }}>{label}</h3>
  );

  return (
    <div>
      {subTitle('ที่พัก (Accommodation)')}
      {accommodationRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>ไม่มีสาขาที่พักในกลุ่มนี้</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Health</th>
                <th style={thStyle}>สาขา</th>
                <th style={thStyle}>Occupancy (%)</th>
                <th style={thStyle}>Revenue (฿)</th>
                <th style={thStyle}>ADR (฿)</th>
                <th style={thStyle}>Rooms</th>
                <th style={thStyle}>RevPAR (฿)</th>
              </tr>
            </thead>
            <tbody>
              {accommodationRows.map((r) => (
                <tr key={r.branchId}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: healthColor(r.health) }}>
                    {r.health != null ? Math.round(r.health) : '—'}
                  </td>
                  <td style={tdStyle}>{r.branchName}</td>
                  <td style={tdStyle}>{r.occ.toFixed(1)}%</td>
                  <td style={tdStyle}>฿{formatCurrency(r.revenue)}</td>
                  <td style={tdStyle}>฿{formatCurrency(r.adr)}</td>
                  <td style={tdStyle}>
                    {r.roomsTotal > 0 ? `${r.roomsSold}/${r.roomsTotal}` : '—'}
                  </td>
                  <td style={tdStyle}>฿{formatCurrency(r.revpar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTitle('F&B')}
      {fnbRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>ไม่มีสาขา F&B ในกลุ่มนี้</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Health</th>
                <th style={thStyle}>สาขา</th>
                <th style={thStyle}>Revenue (฿)</th>
                <th style={thStyle}>Customers</th>
                <th style={thStyle}>Avg ticket (฿)</th>
              </tr>
            </thead>
            <tbody>
              {fnbRows.map((r) => (
                <tr key={r.branchId}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: healthColor(r.health) }}>
                    {r.health != null ? Math.round(r.health) : '—'}
                  </td>
                  <td style={tdStyle}>{r.branchName}</td>
                  <td style={tdStyle}>฿{formatCurrency(r.revenue)}</td>
                  <td style={tdStyle}>{formatCurrency(r.customers, 'en-US')}</td>
                  <td style={tdStyle}>฿{formatCurrency(r.avgTicket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
