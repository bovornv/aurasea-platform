/**
 * Branch Detection Modal Component
 * 
 * Shows detected branches and allows user to:
 * - Review detected branches
 * - Rename branches
 * - Merge branches
 * - Mark as incorrect
 * - Skip/dismiss
 */
'use client';

// Add styles for animations
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  if (!document.head.querySelector('#branch-detection-modal-styles')) {
    style.id = 'branch-detection-modal-styles';
    document.head.appendChild(style);
  }
}

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../hooks/use-i18n';
import { businessGroupService } from '../services/business-group-service';
import { operationalSignalsService, type OperationalSignal } from '../services/operational-signals-service';
import { branchDetectionService, type DetectedBranch } from '../services/branch-detection-service';
import { ModuleType } from '../models/business-group';

interface BranchDetectionModalProps {
  detectedBranches: DetectedBranch[];
  onClose: () => void;
  onConfirm: (branches: Array<{ name: string; signals: any[] }>) => void;
}

export function BranchDetectionModal({ detectedBranches, onClose, onConfirm }: BranchDetectionModalProps) {
  const { locale } = useI18n();
  const router = useRouter();
  const [editingBranches, setEditingBranches] = useState<Array<{ id: string; name: string }>>(
    detectedBranches.map(b => ({ id: b.temporaryId, name: b.inferredName }))
  );
  const [mergedBranches, setMergedBranches] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRename = (id: string, newName: string) => {
    setEditingBranches(prev =>
      prev.map(b => (b.id === id ? { ...b, name: newName } : b))
    );
  };

  const handleMerge = (idToMerge: string, targetId: string) => {
    setMergedBranches(prev => new Set([...prev, idToMerge]));
    // Remove merged branch from editing list
    setEditingBranches(prev => prev.filter(b => b.id !== idToMerge));
  };

  const handleMarkIncorrect = () => {
    branchDetectionService.markDismissed();
    onClose();
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const businessGroup = businessGroupService.getBusinessGroup();
      if (!businessGroup) {
        throw new Error('Business group not found');
      }

      // Get branches that weren't merged
      const branchesToCreate = editingBranches
        .filter(b => !mergedBranches.has(b.id))
        .map(b => {
          const detectedBranch = detectedBranches.find(db => db.temporaryId === b.id);
          return {
            name: b.name,
            signals: detectedBranch?.signals || [],
          };
        });

      // Create branches and reassign signals
      const createdBranches: Array<{ branchId: string; signals: OperationalSignal[] }> = [];

      for (const branchData of branchesToCreate) {
        const branch = businessGroupService.createBranch(
          branchData.name,
          [ModuleType.FNB], // Default, user can change later
          undefined, // location
          undefined, // operatingDays
          crypto.randomUUID(), // branchId (caller should persist to Supabase and sync)
        );

        createdBranches.push({
          branchId: branch.id,
          signals: branchData.signals,
        });
      }

      // Reassign signals to branches
      const signalUpdates: Array<{ timestamp: Date; branchId: string }> = [];
      createdBranches.forEach(({ branchId, signals }) => {
        signals.forEach(signal => {
          signalUpdates.push({
            timestamp: signal.timestamp,
            branchId,
          });
        });
      });

      operationalSignalsService.updateSignalsBranchIds(signalUpdates);

      branchDetectionService.markDetectionRun();
      onConfirm(branchesToCreate);
      router.refresh();
    } catch (error) {
      console.error('Failed to create branches:', error);
      alert(locale === 'th' ? 'เกิดข้อผิดพลาดในการสร้างสาขา' : 'Failed to create branches');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={(e) => {
        // Don't close on backdrop click - user must make a decision
        // This ensures we never force a decision but also don't accidentally dismiss
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideUp 0.3s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#0a0a0a', marginBottom: '0.75rem' }}>
          {locale === 'th' 
            ? 'เราอาจตรวจพบหลายสาขาจากข้อมูลของคุณ'
            : 'We may have detected multiple branches'}
        </h2>
        <p style={{ fontSize: '15px', color: '#374151', marginBottom: '0.5rem', lineHeight: '1.6' }}>
          {locale === 'th'
            ? 'กรุณาตรวจสอบ — คุณควบคุมได้เสมอ'
            : 'Please review — you\'re always in control.'}
        </p>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '2rem', lineHeight: '1.5' }}>
          {locale === 'th'
            ? 'เราวิเคราะห์รูปแบบข้อมูลของคุณและพบว่าอาจมีหลายสาขา คุณสามารถยอมรับ แก้ไข หรือปฏิเสธได้'
            : 'We analyzed your data patterns and found potential branches. You can accept, edit, or reject these suggestions.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
          {editingBranches.map((editingBranch, index) => {
            const detectedBranch = detectedBranches.find(db => db.temporaryId === editingBranch.id);
            if (!detectedBranch) return null;

            // Get example signals (most recent 3)
            const exampleSignals = detectedBranch.signals
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
              .slice(0, 3);

            return (
              <div
                key={editingBranch.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                }}
              >
                {/* Branch Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#374151',
                    flexShrink: 0,
                  }}>
                    {index + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={editingBranch.name}
                      onChange={(e) => handleRename(editingBranch.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '16px',
                        fontWeight: 500,
                        color: '#0a0a0a',
                        marginBottom: '0.5rem',
                      }}
                      placeholder={locale === 'th' ? 'ชื่อสาขา' : 'Branch name'}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        backgroundColor: detectedBranch.confidence >= 0.7 ? '#d1fae5' : detectedBranch.confidence >= 0.5 ? '#fef3c7' : '#fee2e2',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: detectedBranch.confidence >= 0.7 ? '#065f46' : detectedBranch.confidence >= 0.5 ? '#92400e' : '#991b1b',
                      }}>
                        <span>{detectedBranch.confidence >= 0.7 ? '✓' : detectedBranch.confidence >= 0.5 ? '~' : '?'}</span>
                        <span>{Math.round(detectedBranch.confidence * 100)}% {locale === 'th' ? 'ความมั่นใจ' : 'confidence'}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {detectedBranch.signalCount} {locale === 'th' ? 'ข้อมูล' : 'data points'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Example Data */}
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '0.75rem' }}>
                    {locale === 'th' ? 'ตัวอย่างข้อมูล' : 'Example Data'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {exampleSignals.map((signal, sigIndex) => (
                      <div key={sigIndex} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                        color: '#6b7280',
                        padding: '0.375rem 0',
                        borderBottom: sigIndex < exampleSignals.length - 1 ? '1px solid #e5e7eb' : 'none',
                      }}>
                        <span>
                          {new Date(signal.timestamp).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span style={{ fontWeight: 500, color: '#374151' }}>
                          {formatCurrency(signal.revenue7Days / 7)} {locale === 'th' ? 'ต่อวัน' : '/day'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', fontSize: '13px' }}>
                  <div>
                    <div style={{ color: '#6b7280', marginBottom: '0.25rem' }}>
                      {locale === 'th' ? 'รายได้เฉลี่ย' : 'Avg Revenue'}
                    </div>
                    <div style={{ fontWeight: 600, color: '#0a0a0a' }}>
                      {formatCurrency(detectedBranch.averageRevenue)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#6b7280', marginBottom: '0.25rem' }}>
                      {locale === 'th' ? 'รายได้สูงสุด' : 'Peak Revenue'}
                    </div>
                    <div style={{ fontWeight: 600, color: '#0a0a0a' }}>
                      {formatCurrency(detectedBranch.peakRevenue)}
                    </div>
                  </div>
                  {detectedBranch.weekdayPattern && (
                    <div>
                      <div style={{ color: '#6b7280', marginBottom: '0.25rem' }}>
                        {locale === 'th' ? 'วันธรรมดา' : 'Weekdays'}
                      </div>
                      <div style={{ fontWeight: 600, color: '#0a0a0a' }}>
                        {formatCurrency(detectedBranch.weekdayPattern.average)}
                      </div>
                    </div>
                  )}
                  {detectedBranch.weekendPattern && (
                    <div>
                      <div style={{ color: '#6b7280', marginBottom: '0.25rem' }}>
                        {locale === 'th' ? 'วันหยุด' : 'Weekends'}
                      </div>
                      <div style={{ fontWeight: 600, color: '#0a0a0a' }}>
                        {formatCurrency(detectedBranch.weekendPattern.average)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Merge option */}
                {editingBranches.length > 1 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '0.5rem' }}>
                      {locale === 'th' ? 'รวมสาขา' : 'Merge branch'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {editingBranches
                        .filter(b => b.id !== editingBranch.id && !mergedBranches.has(b.id))
                        .map(targetBranch => (
                          <button
                            key={targetBranch.id}
                            onClick={() => handleMerge(editingBranch.id, targetBranch.id)}
                            style={{
                              padding: '0.375rem 0.75rem',
                              backgroundColor: '#ffffff',
                              border: '1px solid #d1d5db',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              color: '#374151',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#9ca3af';
                              e.currentTarget.style.backgroundColor = '#f9fafb';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '#d1d5db';
                              e.currentTarget.style.backgroundColor = '#ffffff';
                            }}
                          >
                            {locale === 'th' ? `รวมกับ ${targetBranch.name}` : `Merge with ${targetBranch.name}`}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb',
        }}>
          <button
            onClick={handleMarkIncorrect}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              color: '#374151',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#9ca3af';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.backgroundColor = '#ffffff';
            }}
          >
            {locale === 'th' ? 'ปฏิเสธ' : 'Reject'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              color: '#374151',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#9ca3af';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.backgroundColor = '#ffffff';
            }}
          >
            {locale === 'th' ? 'ข้าม' : 'Skip'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || editingBranches.length === 0}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: editingBranches.length === 0 ? '#d1d5db' : '#0a0a0a',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: editingBranches.length === 0 ? 'not-allowed' : 'pointer',
              color: '#ffffff',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (editingBranches.length > 0) {
                e.currentTarget.style.backgroundColor = '#374151';
              }
            }}
            onMouseLeave={(e) => {
              if (editingBranches.length > 0) {
                e.currentTarget.style.backgroundColor = '#0a0a0a';
              }
            }}
          >
            {isSubmitting 
              ? (locale === 'th' ? 'กำลังสร้าง...' : 'Creating...')
              : (locale === 'th' ? 'ยอมรับ' : 'Accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
