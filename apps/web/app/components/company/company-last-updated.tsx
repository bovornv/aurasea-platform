'use client';

/** Date only (no time). */
export function CompanyLastUpdated({
  iso,
  locale = 'th',
}: {
  iso?: string | null;
  locale?: string;
}) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const loc = locale === 'th' ? 'th-TH' : 'en-US';
    const line = d.toLocaleDateString(loc, { dateStyle: 'medium' });
    const label = locale === 'th' ? 'อัปเดตล่าสุดเมื่อ:' : 'Last updated:';
    return (
      <p style={{ margin: '0 0 0.75rem', fontSize: '12px', color: '#6b7280' }}>
        {label} {line}
      </p>
    );
  } catch {
    return null;
  }
}
