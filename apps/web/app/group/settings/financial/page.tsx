/**
 * Financial Setup (Optional) - Settings sub-page
 * Owner-only. Optional cash balance and monthly fixed costs; values saved to BusinessSetup (localStorage).
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLayout } from '../../../components/page-layout';
import { useI18n } from '../../../hooks/use-i18n';
import { useBusinessSetup } from '../../../contexts/business-setup-context';
import { useRBAC } from '../../../hooks/use-rbac';
import { Button } from '../../../components/button';

function formatNumberWithCommas(value: number | null): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('en-US');
}

function parseFormattedNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded < 0 ? 0 : rounded;
}

export default function FinancialSetupPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (params?.orgId as string) ?? null;
  const settingsPath = useMemo(() => (orgId ? `/org/${orgId}/settings` : '/group/settings'), [orgId]);
  const { t } = useI18n();
  const { setup, updateSetup } = useBusinessSetup();
  const { isOrganizationOwner, role, isLoading: roleLoading } = useRBAC(); // billing/financial: owner only, not admin

  const [formData, setFormData] = useState({
    currentCashBalance: '',
    monthlyFixedCosts: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFormData({
      currentCashBalance: formatNumberWithCommas(setup.currentCashBalance),
      monthlyFixedCosts: formatNumberWithCommas(setup.monthlyFixedCosts),
    });
  }, [setup.currentCashBalance, setup.monthlyFixedCosts]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOrganizationOwner) return;
    setSaving(true);
    setSaved(false);
    const cash = parseFormattedNumber(formData.currentCashBalance);
    const fixed = parseFormattedNumber(formData.monthlyFixedCosts);
    updateSetup({
      currentCashBalance: cash,
      monthlyFixedCosts: fixed,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSkip = () => {
    router.push(settingsPath);
  };

  if (roleLoading) {
    return (
      <PageLayout title={t('financialSetup.title')} subtitle="">
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
      </PageLayout>
    );
  }

  if (role && !isOrganizationOwner) {
    return (
      <PageLayout title={t('financialSetup.title')} subtitle="">
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            {t('financialSetup.ownerOnly')}
          </p>
          <Link
            href={settingsPath}
            style={{ color: '#0a0a0a', textDecoration: 'underline', fontSize: '14px' }}
          >
            {t('common.back')}
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t('financialSetup.title')}
      subtitle={t('financialSetup.subtitle')}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {t('financialSetup.whyUseful')}
        </p>

        <form onSubmit={handleSave}>
          {/* Current Cash Balance - optional */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="financial-currentCashBalance"
              style={{
                display: 'block',
                fontSize: '15px',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {t('setup.currentCashBalance')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({t('common.optional')})</span>
            </label>
            <input
              id="financial-currentCashBalance"
              type="text"
              inputMode="numeric"
              value={formData.currentCashBalance}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                const parsed = parseFormattedNumber(cleaned);
                const formatted = parsed !== null ? formatNumberWithCommas(parsed) : cleaned.replace(/,/g, '');
                setFormData((prev) => ({ ...prev, currentCashBalance: formatted }));
              }}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '15px',
                color: '#374151',
                backgroundColor: '#ffffff',
              }}
              placeholder={t('setup.currentCashBalancePlaceholder')}
            />
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '0.5rem' }}>
              {t('financialSetup.cashBalanceWhy')}
            </p>
          </div>

          {/* Monthly Fixed Costs - optional */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="financial-monthlyFixedCosts"
              style={{
                display: 'block',
                fontSize: '15px',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {t('setup.monthlyFixedCosts')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({t('common.optional')})</span>
            </label>
            <input
              id="financial-monthlyFixedCosts"
              type="text"
              inputMode="numeric"
              value={formData.monthlyFixedCosts}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9,]/g, '');
                const parsed = parseFormattedNumber(cleaned);
                const formatted = parsed !== null ? formatNumberWithCommas(parsed) : cleaned.replace(/,/g, '');
                setFormData((prev) => ({ ...prev, monthlyFixedCosts: formatted }));
              }}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '15px',
                color: '#374151',
                backgroundColor: '#ffffff',
              }}
              placeholder={t('setup.monthlyFixedCostsPlaceholder')}
            />
            <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '0.5rem' }}>
              {t('financialSetup.monthlyFixedCostsWhy')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? t('financialSetup.saving') : t('financialSetup.save')}
            </Button>
            <button
              type="button"
              onClick={handleSkip}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              {t('financialSetup.skip')}
            </button>
            <Link
              href={settingsPath}
              style={{ fontSize: '14px', color: '#6b7280', marginLeft: '0.5rem' }}
            >
              {t('common.back')}
            </Link>
            {saved && (
              <span style={{ fontSize: '13px', color: '#059669', marginLeft: '0.5rem' }}>
                {t('financialSetup.saved')}
              </span>
            )}
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
