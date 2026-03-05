/**
 * Public homepage — Operating Layer for the Real Economy.
 * Thai-first. Hospitality vertical. Structured sections: Hero, Business Reality,
 * What AuraSea Does, Hospitality Focus, Trust & Infrastructure, Footer.
 * Logged-in users are redirected to dashboard.
 */
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserSession } from './contexts/user-session-context';
import { useUserRole } from './contexts/user-role-context';
import { useOrgBranchPaths } from './hooks/use-org-branch-paths';
import { useLanguageContext } from './contexts/language-context';
import type { Locale } from './i18n/translations';

const SECTION_STYLE = {
  padding: '2rem 1.5rem',
  background: '#ffffff',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
  border: '1px solid #e5e7eb',
};

const COPY = {
  th: {
    heroHeadline: 'AuraSea — ชั้นปฏิบัติการของธุรกิจจริง',
    heroSubline: 'Operating Layer for the Real Economy',
    heroTagline: 'ข้อมูลจริง • ความเสี่ยงจริง • การตัดสินใจจริง',
    ctaTry: 'ขอทดลองใช้',
    ctaSignIn: 'เข้าสู่ระบบ',
    businessRealityTitle: 'ความจริงของธุรกิจ',
    problem1: 'มองไม่เห็นความเสี่ยงจนกว่าจะสาย',
    problem2: 'สภาพคล่องไม่ชัด จัดการยาก',
    problem3: 'แนวโน้มรายได้-ต้นทุน ไม่ได้ใช้ตัดสินใจแบบเรียลไทม์',
    problem4: 'หลายสาขา ข้อมูลกระจาย ไม่มีชั้นรวม',
    whatTitle: 'AuraSea ทำอะไร',
    what1: 'ระบบเตือนความเสี่ยงจากข้อมูลรายวัน',
    what2: 'การควบคุมสภาพคล่องและแนวโน้มกระแสเงินสด',
    what3: 'โครงสร้างการตัดสินใจจากข้อมูลจริง',
    what4: 'ชั้นปฏิบัติการรวมสำหรับหลายสาขา',
    hospitalityTitle: 'สำหรับธุรกิจโรงแรมและร้านอาหาร',
    hospitalityHotels: 'โรงแรม',
    hospitalityHotelsDesc: 'อัตราการเข้าพัก รายได้ต่อห้อง ADR สภาพคล่อง',
    hospitalityFnb: 'ร้านอาหาร',
    hospitalityFnbDesc: 'ยอดขาย ต้นทุนวัตถุดิบ กำไรขั้นต้น สภาพคล่อง',
    trustTitle: 'โครงสร้างความน่าเชื่อถือ',
    trust1: 'เข้ารหัสข้อมูล',
    trust2: 'ระบบสิทธิ์การเข้าถึง (RBAC)',
    trust3: 'บันทึกการใช้งาน (Audit Log)',
    trust4: 'ระบบประมวลผลแบบเรียลไทม์',
    footerTagline: 'Operating Layer for the Real Economy',
    footerRights: 'สร้างขึ้นเพื่อธุรกิจจริงในเศรษฐกิจจริง',
  },
  en: {
    heroHeadline: 'AuraSea — Operating layer for real business',
    heroSubline: 'Operating Layer for the Real Economy',
    heroTagline: 'Real data • Real risk • Real decisions',
    ctaTry: 'Request demo',
    ctaSignIn: 'Sign in',
    businessRealityTitle: 'Business reality',
    problem1: 'Risk stays invisible until it’s too late',
    problem2: 'Liquidity unclear, hard to control',
    problem3: 'Revenue and cost trends not used for real-time decisions',
    problem4: 'Multiple branches, scattered data, no single operating layer',
    whatTitle: 'What AuraSea does',
    what1: 'Risk alerts from daily data',
    what2: 'Liquidity and cash-flow trend control',
    what3: 'Decision structure from real data',
    what4: 'Unified operating layer for multiple branches',
    hospitalityTitle: 'For hotels and restaurants',
    hospitalityHotels: 'Hotels',
    hospitalityHotelsDesc: 'Occupancy, ADR, revenue per room, liquidity',
    hospitalityFnb: 'Restaurants',
    hospitalityFnbDesc: 'Sales, COGS, gross margin, liquidity',
    trustTitle: 'Trust & infrastructure',
    trust1: 'Data encrypted',
    trust2: 'Role-based access (RBAC)',
    trust3: 'Audit logging',
    trust4: 'Real-time processing',
    footerTagline: 'Operating Layer for the Real Economy',
    footerRights: 'Built for real businesses in the real economy.',
  },
} as const;

export default function LandingPage() {
  const router = useRouter();
  const { isLoggedIn } = useUserSession();
  const { role } = useUserRole();
  const paths = useOrgBranchPaths();
  const { locale, setLocale } = useLanguageContext();
  const t = COPY[locale === 'th' ? 'th' : 'en'];

  useEffect(() => {
    if (!isLoggedIn) return;
    const target = paths.companyOverview || paths.branchOverview;
    if (!target) return;
    const effectiveRole = role?.effectiveRole;
    const isOrgRole = effectiveRole === 'owner' || effectiveRole === 'admin';
    const to = effectiveRole != null ? (isOrgRole ? paths.companyOverview : paths.branchOverview) : target;
    if (to) router.replace(to);
  }, [isLoggedIn, role?.effectiveRole, paths.companyOverview, paths.branchOverview, router]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)', color: '#0f172a' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          maxWidth: '1000px',
          margin: '0 auto',
          borderBottom: '1px solid #e2e8f0',
          background: 'rgba(255,255,255,0.85)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' }}>AuraSea</span>
        <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <LanguageToggle locale={locale} setLocale={setLocale} />
          <Link
            href="/login"
            style={{
              padding: '0.5rem 1rem',
              background: '#0f172a',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {t.ctaSignIn}
          </Link>
        </nav>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>
        {/* A. Hero */}
        <section
          style={{
            marginBottom: '3rem',
            padding: '3rem 2rem',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05), 0 10px 30px rgba(0,0,0,0.06)',
            border: '1px solid #e2e8f0',
          }}
        >
          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t.heroSubline}
          </p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25, marginBottom: '1rem', color: '#0f172a' }}>
            {t.heroHeadline}
          </h1>
          <p style={{ fontSize: '1rem', color: '#475569', lineHeight: 1.65, marginBottom: '2rem' }}>
            {t.heroTagline}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Link href="/login" style={{ padding: '0.75rem 1.5rem', background: '#0f172a', color: '#fff', borderRadius: '8px', fontSize: '15px', fontWeight: 600 }}>
              {t.ctaTry}
            </Link>
            <Link href="/login" style={{ padding: '0.75rem 1.5rem', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', fontWeight: 600 }}>
              {t.ctaSignIn}
            </Link>
          </div>
        </section>

        {/* B. Business Reality — 2-column */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: '#0f172a' }}>
            {t.businessRealityTitle}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'stretch' }}>
            <div style={{ ...SECTION_STYLE }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '15px', color: '#334155', lineHeight: 1.55 }}>
                <li style={{ display: 'flex', gap: '0.5rem' }}><span style={{ color: '#64748b' }}>—</span> {t.problem1}</li>
                <li style={{ display: 'flex', gap: '0.5rem' }}><span style={{ color: '#64748b' }}>—</span> {t.problem2}</li>
                <li style={{ display: 'flex', gap: '0.5rem' }}><span style={{ color: '#64748b' }}>—</span> {t.problem3}</li>
                <li style={{ display: 'flex', gap: '0.5rem' }}><span style={{ color: '#64748b' }}>—</span> {t.problem4}</li>
              </ul>
            </div>
            <div
              style={{
                ...SECTION_STYLE,
                background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '140px',
                color: '#64748b',
                fontSize: '14px',
              }}
            >
              {locale === 'th' ? 'โครงสร้างข้อมูลและความเสี่ยง' : 'Data & risk structure'}
            </div>
          </div>
        </section>

        {/* C. What AuraSea Does — 4 cards */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: '#0f172a' }}>
            {t.whatTitle}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem' }}>
            {[t.what1, t.what2, t.what3, t.what4].map((text, i) => (
              <div key={i} style={{ ...SECTION_STYLE, padding: '1.5rem' }}>
                <p style={{ margin: 0, fontSize: '15px', color: '#334155', lineHeight: 1.5 }}>{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* D. Hospitality Focus — 2 blocks */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: '#0f172a' }}>
            {t.hospitalityTitle}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div style={{ ...SECTION_STYLE }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a' }}>{t.hospitalityHotels}</h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>{t.hospitalityHotelsDesc}</p>
            </div>
            <div style={{ ...SECTION_STYLE }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a' }}>{t.hospitalityFnb}</h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>{t.hospitalityFnbDesc}</p>
            </div>
          </div>
        </section>

        {/* E. Trust & Infrastructure */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: '#0f172a' }}>
            {t.trustTitle}
          </h2>
          <div style={{ ...SECTION_STYLE }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '1rem 1.5rem', fontSize: '14px', color: '#475569' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} /> {t.trust1}</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} /> {t.trust2}</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} /> {t.trust3}</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} /> {t.trust4}</li>
            </ul>
          </div>
        </section>

        {/* F. Footer CTA + statement */}
        <section style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <Link href="/login" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', background: '#0f172a', color: '#fff', borderRadius: '8px', fontSize: '15px', fontWeight: 600, marginBottom: '1rem' }}>
            {t.ctaSignIn}
          </Link>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{t.footerRights}</p>
        </section>
      </main>

      <footer style={{ padding: '1.5rem', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '12px', color: '#64748b', background: 'rgba(255,255,255,0.6)' }}>
        {t.footerTagline}
      </footer>
    </div>
  );
}

function LanguageToggle({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      <button
        type="button"
        onClick={() => setLocale('th')}
        style={{
          padding: '0.375rem 0.75rem',
          fontSize: '13px',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          background: locale === 'th' ? '#f1f5f9' : 'transparent',
          color: locale === 'th' ? '#0f172a' : '#64748b',
          fontWeight: locale === 'th' ? 600 : 400,
          cursor: 'pointer',
        }}
      >
        ไทย
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        style={{
          padding: '0.375rem 0.75rem',
          fontSize: '13px',
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          background: locale === 'en' ? '#f1f5f9' : 'transparent',
          color: locale === 'en' ? '#0f172a' : '#64748b',
          fontWeight: locale === 'en' ? 600 : 400,
          cursor: 'pointer',
        }}
      >
        EN
      </button>
    </div>
  );
}
