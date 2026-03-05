'use client';

interface OperatingSectionProps {
  title: string;
  children: React.ReactNode;
}

const sectionStyle = {
  marginBottom: '1.75rem',
  padding: '1.5rem',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)',
};

export function OperatingSection({ title, children }: OperatingSectionProps) {
  return (
    <section style={sectionStyle}>
      <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: '1rem', marginTop: 0 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
