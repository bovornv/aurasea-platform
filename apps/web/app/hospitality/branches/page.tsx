/**
 * Branch Management Page
 * 
 * Allows users to create, edit, and manage branches for their business group.
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLayout } from '../../components/page-layout';
import { businessGroupService } from '../../services/business-group-service';
import { useCurrentBranch } from '../../hooks/use-current-branch';
import { ModuleType, type Branch, type BranchLocation, type OperatingDays } from '../../models/business-group';
import { useI18n } from '../../hooks/use-i18n';

export default function BranchesPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const { branch: currentBranch } = useCurrentBranch();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [businessGroup, setBusinessGroup] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    // Initialize data in useEffect to avoid SSR issues
    const allBranches = businessGroupService.getAllBranches();
    setBranches(allBranches);
    setBusinessGroup(businessGroupService.getBusinessGroup());
  }, []);

  const handleCreateBranch = () => {
    setIsCreating(true);
    setEditingId(null);
  };

  const handleEditBranch = (branchId: string) => {
    setEditingId(branchId);
    setIsCreating(false);
  };

  const handleSaveBranch = (data: {
    branchName: string;
    modules: ModuleType[];
    location?: BranchLocation;
    operatingDays?: OperatingDays;
  }) => {
    if (editingId) {
      // Update existing branch
      businessGroupService.updateBranch(editingId, {
        branchName: data.branchName,
        modules: data.modules,
        location: data.location,
        operatingDays: data.operatingDays,
      });
    } else {
      // Create new branch
      businessGroupService.createBranch(
        data.branchName,
        data.modules,
        data.location,
        data.operatingDays,
        crypto.randomUUID(), // branchId
      );
    }
    
    // Refresh branches list
    const updatedBranches = businessGroupService.getAllBranches();
    setBranches(updatedBranches);
    setIsCreating(false);
    setEditingId(null);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
  };

  const handleSetCurrentBranch = (branchId: string) => {
    businessGroupService.setCurrentBranch(branchId);
    router.refresh();
  };

  const getModuleLabels = (modules: ModuleType[]): string => {
    if (!modules || modules.length === 0) {
      return locale === 'th' ? 'ไม่ระบุ' : 'Not specified';
    }
    const labels: string[] = [];
    if (modules.includes(ModuleType.ACCOMMODATION)) {
      labels.push(locale === 'th' ? 'ที่พัก' : 'Accommodation');
    }
    if (modules.includes(ModuleType.FNB)) {
      labels.push(locale === 'th' ? 'อาหารและเครื่องดื่ม' : 'F&B');
    }
    return labels.join(' • ') || (locale === 'th' ? 'ไม่ระบุ' : 'Not specified');
  };

  return (
    <PageLayout
      title={locale === 'th' ? 'จัดการสาขา' : 'Branch Management'}
      subtitle={locale === 'th' ? 'สร้างและจัดการสาขาของคุณ' : 'Create and manage your branches'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Business Group Info */}
        {businessGroup && (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
            }}
          >
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0.5rem' }}>
              {locale === 'th' ? 'กลุ่มธุรกิจ' : 'Business Group'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 500, color: '#0a0a0a' }}>
              {businessGroup.name}
            </div>
          </div>
        )}

        {/* Branches List */}
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '1.5rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 500, margin: 0 }}>
              {locale === 'th' ? 'สาขาทั้งหมด' : 'All Branches'}
            </h2>
            {!isCreating && !editingId && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Link
                  href="/hospitality/branches/compare"
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  {locale === 'th' ? 'เปรียบเทียบ' : 'Compare'}
                </Link>
                <button
                  onClick={handleCreateBranch}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#0a0a0a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  {locale === 'th' ? '+ เพิ่มสาขา' : '+ Add Branch'}
                </button>
              </div>
            )}
          </div>

          {/* Branch Form */}
          {(isCreating || editingId) && (
            <BranchForm
              branch={editingId ? branches.find(b => b.id === editingId) : undefined}
              onSave={handleSaveBranch}
              onCancel={handleCancel}
            />
          )}

          {/* Branches List */}
          <div>
            {branches.map((branch) => (
              <div
                key={branch.id}
                style={{
                  padding: '1.5rem',
                  borderBottom: '1px solid #f3f4f6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 500, margin: 0 }}>
                      {branch.branchName}
                    </h3>
                    {branch.id === currentBranch?.id && (
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        {locale === 'th' ? 'สาขาปัจจุบัน' : 'Current'}
                      </span>
                    )}
                    {branch.isDefault && (
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#f3f4f6',
                          color: '#6b7280',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {locale === 'th' ? 'ค่าเริ่มต้น' : 'Default'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '0.5rem' }}>
                    {getModuleLabels(branch.modules || [])}
                  </div>
                  {branch.location && (
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                      {[branch.location.city, branch.location.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {branch.operatingDays && (
                    <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '0.5rem' }}>
                      {branch.operatingDays.weekdays && branch.operatingDays.weekends
                        ? locale === 'th' ? 'เปิดทุกวัน' : 'Open all days'
                        : branch.operatingDays.weekdays
                        ? locale === 'th' ? 'เปิดวันธรรมดา' : 'Weekdays only'
                        : branch.operatingDays.weekends
                        ? locale === 'th' ? 'เปิดวันหยุดสุดสัปดาห์' : 'Weekends only'
                        : locale === 'th' ? 'ไม่ระบุ' : 'Not specified'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {branch.id !== currentBranch?.id && (
                    <button
                      onClick={() => handleSetCurrentBranch(branch.id)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      {locale === 'th' ? 'เลือก' : 'Switch'}
                    </button>
                  )}
                  <button
                    onClick={() => handleEditBranch(branch.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {locale === 'th' ? 'แก้ไข' : 'Edit'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

interface BranchFormProps {
  branch?: Branch;
  onSave: (data: {
    branchName: string;
    modules: ModuleType[];
    location?: BranchLocation;
    operatingDays?: OperatingDays;
  }) => void;
  onCancel: () => void;
}

function BranchForm({ branch, onSave, onCancel }: BranchFormProps) {
  const { locale } = useI18n();
  const [branchName, setBranchName] = useState(branch?.branchName || '');
  const [modules, setModules] = useState<ModuleType[]>(
    branch?.modules && branch.modules.length > 0 ? branch.modules : [ModuleType.FNB]
  );
  const [city, setCity] = useState(branch?.location?.city || '');
  const [country, setCountry] = useState(branch?.location?.country || '');
  const [weekdays, setWeekdays] = useState(branch?.operatingDays?.weekdays ?? true);
  const [weekends, setWeekends] = useState(branch?.operatingDays?.weekends ?? true);

  const handleModuleToggle = (moduleType: ModuleType) => {
    setModules(prev => {
      if (prev.includes(moduleType)) {
        // Don't allow removing the last module
        if (prev.length === 1) return prev;
        return prev.filter(m => m !== moduleType);
      } else {
        return [...prev, moduleType];
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || modules.length === 0) return;

    onSave({
      branchName: branchName.trim(),
      modules,
      location: city || country ? { city: city || undefined, country: country || undefined } : undefined,
      operatingDays: { weekdays, weekends },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: '#374151',
            }}
          >
            {locale === 'th' ? 'ชื่อสาขา' : 'Branch Name'} *
          </label>
          <input
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: '#374151',
            }}
          >
            {locale === 'th' ? 'โมดูลที่เปิดใช้งาน' : 'Enabled Modules'} *
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={modules.includes(ModuleType.ACCOMMODATION)}
                onChange={() => handleModuleToggle(ModuleType.ACCOMMODATION)}
                disabled={modules.length === 1 && modules.includes(ModuleType.ACCOMMODATION)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span>{locale === 'th' ? 'ที่พัก (Accommodation)' : 'Accommodation'}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={modules.includes(ModuleType.FNB)}
                onChange={() => handleModuleToggle(ModuleType.FNB)}
                disabled={modules.length === 1 && modules.includes(ModuleType.FNB)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span>{locale === 'th' ? 'อาหารและเครื่องดื่ม (F&B)' : 'Food & Beverage (F&B)'}</span>
            </label>
          </div>
          {modules.length === 0 && (
            <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '0.25rem' }}>
              {locale === 'th' ? 'ต้องเลือกอย่างน้อยหนึ่งโมดูล' : 'At least one module must be selected'}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {locale === 'th' ? 'เมือง' : 'City'}
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              {locale === 'th' ? 'ประเทศ' : 'Country'}
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '0.5rem',
              color: '#374151',
            }}
          >
            {locale === 'th' ? 'วันทำการ' : 'Operating Days'}
          </label>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={weekdays}
                onChange={(e) => setWeekdays(e.target.checked)}
              />
              <span style={{ fontSize: '14px' }}>
                {locale === 'th' ? 'วันธรรมดา' : 'Weekdays'} (Mon-Fri)
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={weekends}
                onChange={(e) => setWeekends(e.target.checked)}
              />
              <span style={{ fontSize: '14px' }}>
                {locale === 'th' ? 'วันหยุดสุดสัปดาห์' : 'Weekends'} (Sat-Sun)
              </span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ffffff',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
          </button>
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#0a0a0a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {locale === 'th' ? 'บันทึก' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
