// Login page - Supabase auth when configured; mock otherwise
'use client';

import { useState, useEffect } from 'react';
import { PageLayout } from '../components/page-layout';
import { Button } from '../components/button';
import { useI18n } from '../hooks/use-i18n';
import { useRouter } from 'next/navigation';
import { useUserSession } from '../contexts/user-session-context';
import { useLanguageContext } from '../contexts/language-context';
import { useContextMode } from '../hooks/use-context-mode';
import { getSupabaseClient, isSupabaseAvailable } from '../lib/supabase/client';
import { BRANCH_SELECT } from '../lib/db-selects';
import { businessGroupService } from '../services/business-group-service';
import type { UserRole } from '../services/permissions-service';

const LANG_BTN_BASE = {
  padding: '0.375rem 0.75rem',
  fontSize: '13px',
  borderRadius: '6px',
  cursor: 'pointer',
  border: '1px solid #d1d5db',
} as const;

function activeLangStyle() {
  return { fontWeight: 600, color: '#0a0a0a', background: '#f3f4f6', border: '1px solid #9ca3af' };
}

function inactiveLangStyle() {
  return { fontWeight: 400, color: '#6b7280', background: 'transparent' };
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { t } = useI18n();
  const { locale, setLocale } = useLanguageContext();
  const router = useRouter();
  const { login, isLoggedIn, permissions, updatePermissions } = useUserSession();
  const { mode } = useContextMode();
  const useSupabaseAuth = isSupabaseAvailable();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError(locale === 'th' ? 'กรุณากรอกอีเมลและรหัสผ่าน' : 'Please enter email and password.');
      return;
    }

    const emailTrimmed = email.trim();
    setLoading(true);

    const timeoutMs = 28_000;
    const timeoutMessage =
      locale === 'th'
        ? 'หมดเวลาเชื่อมต่อ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'
        : 'Connection timed out. Check your internet and try again.';
    const failedFetchMessage =
      locale === 'th'
        ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'
        : 'Could not reach the server. Check your connection and try again.';

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(timeoutMessage)), ms);
        p.then(
          (v) => {
            clearTimeout(t);
            resolve(v);
          },
          (err) => {
            clearTimeout(t);
            reject(err);
          }
        );
      });

    try {
      if (useSupabaseAuth) {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError(locale === 'th' ? 'ระบบยังไม่พร้อม กรุณาลองใหม่ภายหลัง' : 'Auth not available. Try again later.');
          return;
        }

        await withTimeout(
          (async () => {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
              email: emailTrimmed,
              password,
            });
            if (authError) {
              const message =
                authError.message?.includes('Invalid login')
                  ? locale === 'th'
                    ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
                    : 'Invalid email or password.'
                  : authError.message || (locale === 'th' ? 'เข้าสู่ระบบไม่สำเร็จ' : 'Sign in failed.');
              setError(message);
              return;
            }
            if (!data.user) {
              setError(locale === 'th' ? 'เข้าสู่ระบบไม่สำเร็จ' : 'Sign in failed.');
              return;
            }

            await login(emailTrimmed);

            const { data: memberships, error: memErr } = await supabase
              .from('organization_members')
              .select('organization_id, role')
              .eq('user_id', data.user.id)
              .order('created_at', { ascending: true });
            if (memErr) {
              setError(memErr.message || (locale === 'th' ? 'โหลดสิทธิ์ไม่สำเร็จ' : 'Could not load your access.'));
              return;
            }

            const orgList = (memberships ?? []) as { organization_id: string; role: string }[];
            const ownerOrAdmin = orgList.find((r) => r.role === 'owner' || r.role === 'admin');
            const { data: branchRows, error: brErr } = await supabase
              .from('branch_members')
              .select('branch_id, role')
              .eq('user_id', data.user.id);
            if (brErr) {
              setError(brErr.message || (locale === 'th' ? 'โหลดสาขาไม่สำเร็จ' : 'Could not load branches.'));
              return;
            }

            const branchList = (branchRows ?? []) as { branch_id: string; role: string }[];
            const firstBranchId = branchList.length ? (branchList[0] as { branch_id: string }).branch_id : null;
            const branchRole = branchList.length
              ? ((branchList[0] as { role: string }).role as UserRole) || 'staff'
              : null;
            let orgId: string | null = null;
            let organization: { id: string; name: string } | null = null;
            if (ownerOrAdmin) {
              orgId = ownerOrAdmin.organization_id;
            } else if (firstBranchId) {
              const { data: branch, error: bErr } = await supabase
                .from('branches')
                .select(BRANCH_SELECT)
                .eq('id', firstBranchId)
                .maybeSingle();
              if (bErr) {
                setError(bErr.message || (locale === 'th' ? 'โหลดข้อมูลสาขาไม่สำเร็จ' : 'Could not load branch.'));
                return;
              }
              orgId = (branch as { organization_id?: string } | null)?.organization_id ?? null;
              if (orgId) {
                const { data: orgRow, error: oErr } = await supabase
                  .from('organizations')
                  .select('id, name')
                  .eq('id', orgId)
                  .maybeSingle();
                if (oErr) {
                  setError(oErr.message || (locale === 'th' ? 'โหลดองค์กรไม่สำเร็จ' : 'Could not load organization.'));
                  return;
                }
                organization = orgRow as { id: string; name: string } | null;
              }
            }
            const role = ownerOrAdmin ? (ownerOrAdmin.role as UserRole) : branchRole;
            if (!organization && orgId) {
              const { data: orgRow, error: o2Err } = await supabase
                .from('organizations')
                .select('id, name')
                .eq('id', orgId)
                .maybeSingle();
              if (o2Err) {
                setError(o2Err.message || (locale === 'th' ? 'โหลดองค์กรไม่สำเร็จ' : 'Could not load organization.'));
                return;
              }
              organization = orgRow as { id: string; name: string } | null;
            }
            if (orgId && role) {
              if (['owner', 'admin'].includes(role)) {
                router.replace(`/org/${orgId}/overview`);
                return;
              }
              if (firstBranchId && organization) {
                updatePermissions(branchRole!, orgId, branchList.map((r) => (r as { branch_id: string }).branch_id));
                if (typeof window !== 'undefined') {
                  try {
                    localStorage.setItem(
                      'hospitality_business_group',
                      JSON.stringify({
                        id: organization.id,
                        name: organization.name,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      })
                    );
                  } catch (_) {}
                }
                await businessGroupService.syncBranchesForOrgAndUser(orgId, data.user.id);
                businessGroupService.setCurrentBranch(firstBranchId);
                router.replace(`/org/${orgId}/branch/${firstBranchId}/overview`);
                return;
              }
              router.replace('/no-access?reason=branch');
              return;
            }
            const { data: pa, error: paErr } = await supabase
              .from('platform_admins')
              .select('role')
              .eq('user_id', data.user.id)
              .maybeSingle();
            if (paErr) {
              setError(paErr.message || (locale === 'th' ? 'โหลดสิทธิ์ไม่สำเร็จ' : 'Could not load permissions.'));
              return;
            }
            if ((pa as { role?: string } | null)?.role === 'super_admin') {
              const { data: firstOrg, error: foErr } = await supabase.from('organizations').select('id').limit(1);
              if (foErr) {
                setError(foErr.message || (locale === 'th' ? 'โหลดองค์กรไม่สำเร็จ' : 'Could not load organizations.'));
                return;
              }
              const orgRow = (firstOrg as { id: string }[] | null)?.[0];
              if (orgRow?.id) {
                router.replace(`/org/${orgRow.id}/overview`);
                return;
              }
            }
            router.replace('/no-access');
          })(),
          timeoutMs
        );
      } else {
        await new Promise((r) => setTimeout(r, 300));
        await login(emailTrimmed);
        router.replace('/');
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const isTimeout = raw === timeoutMessage;
      const isNetwork =
        /failed to fetch|networkerror|load failed|network request failed/i.test(raw) ||
        (err instanceof TypeError && raw.toLowerCase().includes('fetch'));
      const msg = isTimeout
        ? timeoutMessage
        : isNetwork
          ? failedFetchMessage
          : locale === 'th'
            ? `เกิดข้อผิดพลาด: ${raw}`
            : raw;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout title="" subtitle="">
      <div style={{ maxWidth: '420px', margin: '2rem auto', padding: '0 1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>
          {t('login.title')}
        </h1>
        {t('login.subtitle') ? (
          <p style={{ fontSize: '0.9375rem', color: '#475569', marginBottom: '1.5rem', lineHeight: 1.4 }}>
            {t('login.subtitle')}
          </p>
        ) : null}
        {/* Language: Thai default */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <button
            type="button"
            className={`lang-btn ${mounted && locale === 'th' ? 'active' : ''}`}
            onClick={() => setLocale('th')}
            style={{
              ...LANG_BTN_BASE,
              ...(mounted && locale === 'th' ? activeLangStyle() : inactiveLangStyle()),
            }}
          >
            ไทย
          </button>
          <button
            type="button"
            className={`lang-btn ${mounted && locale === 'en' ? 'active' : ''}`}
            onClick={() => setLocale('en')}
            style={{
              ...LANG_BTN_BASE,
              ...(mounted && locale === 'en' ? activeLangStyle() : inactiveLangStyle()),
            }}
          >
            English
          </button>
        </div>
        {error && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: '6px',
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {t('login.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                color: '#374151',
                backgroundColor: '#ffffff',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {t('login.password')}
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  paddingRight: '2.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  color: '#374151',
                  backgroundColor: '#ffffff',
                }}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                }}
              >
                {showPassword ? t('login.hidePassword') : t('login.showPassword')}
              </button>
            </div>
          </div>

          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? t('login.signingIn') : t('login.signIn')}
          </Button>
        </form>
        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '1.5rem', lineHeight: 1.4 }}>
          {t('login.trustLine')}
        </p>
      </div>
    </PageLayout>
  );
}
