/**
 * Hook for Health Score Hierarchy
 *
 * Provides group and branch health scores from real Supabase data only.
 */
'use client';

import { useState, useEffect } from 'react';
import { useCurrentBranch } from './use-current-branch';
import { useAlertStore } from '../contexts/alert-store-context';
import { useUserSession } from '../contexts/user-session-context';
import { getHealthScoreHierarchy, type GroupHealthScore } from '../services/health-score-service';
import { businessGroupService } from '../services/business-group-service';

export function useHealthScore(): {
  groupHealthScore: GroupHealthScore | null;
  isLoading: boolean;
} {
  const { isAllBranches } = useCurrentBranch();
  const { alerts: rawAlerts } = useAlertStore();
  const { permissions } = useUserSession();

  const [groupHealthScore, setGroupHealthScore] = useState<GroupHealthScore | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Only run on client side to avoid hydration mismatch
    if (typeof window === 'undefined') return;
    
    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // PART 4: Listen for organization changes to force recalculation
    const handleOrganizationChange = () => {
      if (!mounted) return;
      // Clear current score to force recalculation
      setGroupHealthScore(null);
      setIsLoading(true);
      // Trigger recalculation
      calculateHealthScore();
    };

    const handleForceRecalculation = () => {
      if (!mounted) return;
      setGroupHealthScore(null);
      setIsLoading(true);
      calculateHealthScore();
    };

    window.addEventListener('organizationChanged', handleOrganizationChange);
    window.addEventListener('forceRecalculation', handleForceRecalculation);

    const calculateHealthScore = () => {
      if (!mounted) return;
      setIsLoading(true);
      
      try {
        const businessGroup = businessGroupService.getBusinessGroup();
        if (!businessGroup) {
          if (mounted) {
            // STEP 3: Return null instead of 0
            setGroupHealthScore({
              healthScore: null, // Will be handled by UI to show "No data"
              confidence: 0,
              branchesIncluded: 0,
              branchesExcluded: 0,
              branchScores: [],
            });
            setIsLoading(false);
          }
          return;
        }

        const roleForHierarchy: 'owner' | 'manager' | 'branch' =
          permissions.role === 'owner' || permissions.role === 'admin' ? 'owner'
          : permissions.role === 'manager' ? 'manager'
          : 'branch';
        const hierarchy = getHealthScoreHierarchy(rawAlerts || [], businessGroup.id, {
          role: roleForHierarchy,
          organizationId: permissions.organizationId,
          branchIds: permissions.branchIds || [],
        });
        
        if (!mounted) return;
        
        // STEP 3: Ensure hierarchy is valid - allow null healthScore
        const safeHierarchy = hierarchy && (
            hierarchy.healthScore === null || 
            (typeof hierarchy.healthScore === 'number' && 
             !isNaN(hierarchy.healthScore) && 
             isFinite(hierarchy.healthScore))
          )
          ? hierarchy
          : {
              healthScore: null, // Will be handled by UI to show "No data"
              confidence: 0,
              branchesIncluded: 0,
              branchesExcluded: 0,
              branchScores: [],
            };
        
        // STABILITY: Only update if hierarchy changed (shallow comparison)
        setGroupHealthScore(prev => {
          if (prev && prev.healthScore === safeHierarchy.healthScore &&
              prev.confidence === safeHierarchy.confidence &&
              prev.branchesIncluded === safeHierarchy.branchesIncluded &&
              prev.branchesExcluded === safeHierarchy.branchesExcluded &&
              prev.branchScores.length === safeHierarchy.branchScores.length) {
            // Check if branch scores changed
            const branchScoresChanged = prev.branchScores.some((p, i) => {
              const n = safeHierarchy.branchScores[i];
              return !n || p.branchId !== n.branchId || p.healthScore !== n.healthScore;
            });
            if (!branchScoresChanged) return prev;
          }
          return safeHierarchy;
        });
      } catch (err) {
        // On error: no fake data, return null
        if (mounted) {
          setGroupHealthScore({
            healthScore: null, // Will be handled by UI to show "No data"
            confidence: 0,
            branchesIncluded: 0,
            branchesExcluded: 0,
            branchScores: [],
          });
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          // Clear timeout since we completed successfully
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      }
    };

    calculateHealthScore();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('organizationChanged', handleOrganizationChange);
      window.removeEventListener('forceRecalculation', handleForceRecalculation);
    };
  }, [
    isAllBranches,
    rawAlerts?.length || 0,
    permissions.role,
    permissions.organizationId,
    permissions.branchIds?.join(',') || '',
  ]);

  return { groupHealthScore, isLoading };
}
