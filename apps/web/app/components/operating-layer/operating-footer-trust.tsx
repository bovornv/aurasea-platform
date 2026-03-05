'use client';

export function OperatingFooterTrust() {
  return (
    <footer
      style={{
        marginTop: '2rem',
        paddingTop: '1.25rem',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        color: '#6b7280',
      }}
    >
      <span>เข้ารหัสข้อมูล</span>
      <span>·</span>
      <span>ระบบสิทธิ์การเข้าถึง (RBAC)</span>
      <span>·</span>
      <span>บันทึกการใช้งาน (Audit Log)</span>
      <span>·</span>
      <span>ระบบประมวลผลแบบเรียลไทม์</span>
    </footer>
  );
}
