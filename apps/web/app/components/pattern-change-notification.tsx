/**
 * Pattern Change Notification Component
 * 
 * Gently notifies owners about detected pattern changes in existing branches.
 * Never forces decisions - user can review, dismiss, or ignore.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../hooks/use-i18n';
import { branchDetectionService, type PatternChangeSuggestion } from '../services/branch-detection-service';
import { BranchDetectionModal } from './branch-detection-modal';

interface PatternChangeNotificationProps {
  suggestions: PatternChangeSuggestion[];
  onDismiss: () => void;
}

export function PatternChangeNotification({ suggestions, onDismiss }: PatternChangeNotificationProps) {
  const { locale } = useI18n();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<PatternChangeSuggestion | null>(null);

  if (suggestions.length === 0) {
    return null;
  }

  const handleReview = (suggestion: PatternChangeSuggestion) => {
    if (suggestion.type === 'split' && suggestion.suggestedBranches) {
      setSelectedSuggestion(suggestion);
      setShowModal(true);
    } else {
      // For merge suggestions, navigate to branches page
      router.push('/hospitality/branches');
      onDismiss();
    }
  };

  const handleDismiss = (suggestion: PatternChangeSuggestion) => {
    branchDetectionService.dismissPatternChange(suggestion.branchId);
    onDismiss();
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedSuggestion(null);
  };

  const handleModalConfirm = () => {
    setShowModal(false);
    setSelectedSuggestion(null);
    router.refresh();
  };

  return (
    <>
      {showModal && selectedSuggestion && selectedSuggestion.suggestedBranches && (
        <BranchDetectionModal
          detectedBranches={selectedSuggestion.suggestedBranches}
          onClose={handleModalClose}
          onConfirm={handleModalConfirm}
        />
      )}

      <div
        style={{
          border: '1px solid #3b82f6',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          backgroundColor: '#eff6ff',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            backgroundColor: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '0.125rem',
          }}>
            <span style={{ color: '#ffffff', fontSize: '14px' }}>💡</span>
          </div>
          
          <div style={{ flex: 1 }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#1e40af',
              margin: '0 0 0.5rem 0',
            }}>
              {locale === 'th'
                ? 'เราสังเกตเห็นรูปแบบใหม่ — คุณต้องการตรวจสอบไหม?'
                : 'We noticed new patterns — would you like to review?'}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.branchId}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    padding: '1rem',
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#1e40af', marginBottom: '0.25rem' }}>
                        {suggestion.branchName}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                        {suggestion.reason}
                      </div>
                    </div>
                    <div style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: suggestion.confidence >= 0.8 ? '#d1fae5' : '#fef3c7',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: suggestion.confidence >= 0.8 ? '#065f46' : '#92400e',
                      whiteSpace: 'nowrap',
                    }}>
                      {Math.round(suggestion.confidence * 100)}%
                    </div>
                  </div>

                  {suggestion.type === 'split' && suggestion.suggestedBranches && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.5rem' }}>
                      {locale === 'th'
                        ? `แนะนำให้แบ่งเป็น ${suggestion.suggestedBranches.length} สาขา`
                        : `Suggests splitting into ${suggestion.suggestedBranches.length} branches`}
                    </div>
                  )}

                  {suggestion.type === 'merge' && suggestion.suggestedMergeWith && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.5rem' }}>
                      {locale === 'th'
                        ? `แนะนำให้รวมกับ: ${suggestion.suggestedMergeWith.map(b => b.branchName).join(', ')}`
                        : `Suggests merging with: ${suggestion.suggestedMergeWith.map(b => b.branchName).join(', ')}`}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleReview(suggestion)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background-color 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#3b82f6';
                      }}
                    >
                      {locale === 'th' ? 'ตรวจสอบ' : 'Review'}
                    </button>
                    <button
                      onClick={() => handleDismiss(suggestion)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#ffffff',
                        color: '#6b7280',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
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
                      {locale === 'th' ? 'ปิด' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
