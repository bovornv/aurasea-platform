'use client';

import type { CompanyDataConfidenceRow } from '../../services/db/company-data-confidence-service';

const MAX_DAYS = 30;

function normalizeLevel(raw: string): 'Low' | 'Medium' | 'High' {
  const s = raw.trim().toLowerCase();
  if (s === 'high') return 'High';
  if (s === 'medium') return 'Medium';
  return 'Low';
}

function levelColor(level: 'Low' | 'Medium' | 'High'): string {
  if (level === 'High') return '#059669';
  if (level === 'Medium') return '#ea580c';
  return '#dc2626';
}

export function CompanyDataConfidence({
  row,
  loading,
  locale,
}: {
  row: CompanyDataConfidenceRow | null;
  loading: boolean;
  locale: string;
}) {
  const isTh = locale === 'th';
  const empty = row == null;
  const dataDays = empty ? 0 : Math.max(0, Math.min(MAX_DAYS, row.data_days));
  const level = normalizeLevel(empty ? 'low' : row.confidence_level);
  const labelColor = levelColor(level);

  const title = isTh
    ? `ความน่าเชื่อถือของข้อมูล (${dataDays}/${MAX_DAYS} วัน)`
    : `Data Confidence (${dataDays}/${MAX_DAYS} days)`;

  const caveat = isTh
    ? 'คำแนะนำบางอย่างอาจแม่นยำน้อยลง'
    : 'Some recommendations may be less accurate';

  const noData = isTh ? 'ยังไม่มีข้อมูล' : 'No data available yet';

  if (loading) {
    return (
      <div style={{ marginTop: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>
          {isTh ? 'กำลังโหลดความครอบคลุมข้อมูล…' : 'Loading data confidence…'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{title}</span>
      </div>
      {empty ? (
        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af', lineHeight: 1.45, fontWeight: 400 }}>
          {noData}
        </p>
      ) : level !== 'High' ? (
        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af', lineHeight: 1.45, fontWeight: 400 }}>
          {caveat}
        </p>
      ) : null}
    </div>
  );
}
