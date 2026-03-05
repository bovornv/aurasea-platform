/**
 * Hook for Branch Detection
 * 
 * Automatically detects branches and shows confirmation modal when appropriate.
 * Also checks for pattern changes in existing branches.
 */
'use client';

import { useState, useEffect } from 'react';
import { branchDetectionService, type DetectedBranch, type PatternChangeSuggestion } from '../services/branch-detection-service';

export function useBranchDetection() {
  const [detectedBranches, setDetectedBranches] = useState<DetectedBranch[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [patternChanges, setPatternChanges] = useState<PatternChangeSuggestion[]>([]);
  const [showPatternNotification, setShowPatternNotification] = useState(false);

  useEffect(() => {
    // Check if detection should run (for new branches)
    if (
      typeof window !== 'undefined' &&
      branchDetectionService.shouldRunDetection() &&
      !branchDetectionService.hasUserDismissed()
    ) {
      setIsDetecting(true);
      try {
        const result = branchDetectionService.detectBranches();
        
        if (result.shouldSuggest && result.detectedBranches.length >= 2) {
          setDetectedBranches(result.detectedBranches);
          setShowModal(true);
        } else {
          // Mark as run even if no branches detected
          branchDetectionService.markDetectionRun();
        }
      } catch (error) {
        console.error('Branch detection failed:', error);
      } finally {
        setIsDetecting(false);
      }
    }

    // Check for pattern changes in existing branches (continuous learning)
    if (typeof window !== 'undefined' && branchDetectionService.shouldRunPatternCheck()) {
      try {
        const patternResult = branchDetectionService.checkPatternChanges();
        
        if (patternResult.hasChanges) {
          // Filter out dismissed suggestions
          const activeSuggestions = patternResult.suggestions.filter(
            s => !branchDetectionService.hasDismissedPatternChanges(s.branchId)
          );
          
          if (activeSuggestions.length > 0) {
            setPatternChanges(activeSuggestions);
            setShowPatternNotification(true);
          }
        }
        
        // Mark pattern check as run
        branchDetectionService.markPatternCheckRun();
      } catch (error) {
        console.error('Pattern change check failed:', error);
      }
    }
  }, []);

  const handleClose = () => {
    setShowModal(false);
    branchDetectionService.markDetectionRun();
  };

  const handleDismiss = () => {
    branchDetectionService.markDismissed();
    setShowModal(false);
  };

  const handleConfirm = () => {
    branchDetectionService.markDetectionRun();
    setShowModal(false);
    // Page will refresh after branch creation
  };

  const handlePatternNotificationDismiss = () => {
    setShowPatternNotification(false);
  };

  return {
    detectedBranches,
    showModal,
    isDetecting,
    handleClose,
    handleDismiss,
    handleConfirm,
    patternChanges,
    showPatternNotification,
    handlePatternNotificationDismiss,
  };
}
