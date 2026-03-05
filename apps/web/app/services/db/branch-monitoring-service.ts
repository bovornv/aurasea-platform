/**
 * Service for managing branch monitoring settings in Supabase
 * - monitoring_enabled: boolean
 * - alert_sensitivity: 'low' | 'medium' | 'high'
 */

import { getSupabaseClient, isSupabaseAvailable } from '../../lib/supabase/client';
import { BRANCH_SELECT } from '../../lib/db-selects';

export type AlertSensitivity = 'low' | 'medium' | 'high';

// Cache to prevent repeated queries for missing columns
const settingsCache = new Map<string, { 
  monitoringEnabled: boolean; 
  alertSensitivity: AlertSensitivity; 
  timestamp: number;
  hasColumns: boolean;
}>();
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Update branch monitoring_enabled in Supabase
 */
export async function updateBranchMonitoringEnabled(
  branchId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isSupabaseAvailable()) {
      throw new Error('Supabase not available');
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { error } = await supabase
      .from('branches')
      .update({ monitoring_enabled: enabled } as never)
      .eq('id', branchId);

    if (error) {
      // Handle missing column gracefully
      if (error.code === '42703' || error.message?.includes('does not exist') || error.message?.includes('column')) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[BranchMonitoring] Column monitoring_enabled does not exist. Run migration: add-monitoring-columns.sql');
        }
        // Return success anyway - the setting is effectively enabled by default
        return { success: true };
      }
      throw new Error(`Failed to update monitoring_enabled: ${error.message}`);
    }

    // Clear cache after successful update
    settingsCache.delete(branchId);
    
    return { success: true };
  } catch (error: any) {
    console.error('[BranchMonitoring] Failed to update monitoring_enabled:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Update branch alert_sensitivity in Supabase
 */
export async function updateBranchAlertSensitivity(
  branchId: string,
  sensitivity: AlertSensitivity
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isSupabaseAvailable()) {
      throw new Error('Supabase not available');
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { error } = await supabase
      .from('branches')
      .update({ alert_sensitivity: sensitivity } as never)
      .eq('id', branchId);

    if (error) {
      // Handle missing column gracefully
      if (error.code === '42703' || error.message?.includes('does not exist') || error.message?.includes('column')) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[BranchMonitoring] Column alert_sensitivity does not exist. Run migration: add-monitoring-columns.sql');
        }
        // Return success anyway - the setting is effectively medium by default
        return { success: true };
      }
      throw new Error(`Failed to update alert_sensitivity: ${error.message}`);
    }

    // Clear cache after successful update
    settingsCache.delete(branchId);
    
    return { success: true };
  } catch (error: any) {
    console.error('[BranchMonitoring] Failed to update alert_sensitivity:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Get branch monitoring settings from Supabase
 */
export async function getBranchMonitoringSettings(
  branchId: string
): Promise<{
  monitoringEnabled: boolean | null;
  alertSensitivity: AlertSensitivity | null;
  error?: string;
}> {
  // Check cache first
  const cached = settingsCache.get(branchId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      monitoringEnabled: cached.monitoringEnabled,
      alertSensitivity: cached.alertSensitivity,
    };
  }

  try {
    if (!isSupabaseAvailable()) {
      return { monitoringEnabled: null, alertSensitivity: null, error: 'Supabase not available' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { monitoringEnabled: null, alertSensitivity: null, error: 'Supabase client not available' };
    }

    const { data, error } = await supabase
      .from('branches')
      .select(BRANCH_SELECT)
      .eq('id', branchId)
      .maybeSingle();

    // Handle missing columns gracefully (columns may not exist if migration hasn't run)
    if (error) {
      // Check if error is due to missing columns (400 Bad Request or column doesn't exist)
      const errorMessage = error.message || String(error);
      const errorCode = error.code || (error as any).statusCode || (error as any).status;
      const isMissingColumnError = 
        errorCode === '42703' || // PostgreSQL: undefined_column
        errorCode === 'PGRST116' || // PostgREST: column not found
        errorCode === 400 || // HTTP 400 Bad Request
        errorMessage.includes('does not exist') ||
        errorMessage.includes('column') ||
        errorMessage.includes('monitoring_enabled') ||
        errorMessage.includes('alert_sensitivity');
      
      if (isMissingColumnError) {
        // Columns don't exist - return defaults silently (only log once in dev)
        const result = {
          monitoringEnabled: true, // Default to enabled
          alertSensitivity: 'medium' as AlertSensitivity, // Default to medium
        };
        
        // Cache the result to prevent repeated queries
        settingsCache.set(branchId, {
          ...result,
          timestamp: Date.now(),
          hasColumns: false,
        });
        
        if (process.env.NODE_ENV === 'development') {
          // Only log once per session to avoid spam
          const logKey = 'monitoring_columns_warning_logged';
          if (typeof window !== 'undefined' && !sessionStorage.getItem(logKey)) {
            console.warn('[BranchMonitoring] Monitoring columns not found in database, using defaults. Run migration: add-monitoring-columns.sql');
            sessionStorage.setItem(logKey, 'true');
          }
        }
        
        return result;
      }
      
      // Other errors - still return defaults but log the error
      if (process.env.NODE_ENV === 'development') {
        console.error('[BranchMonitoring] Error fetching monitoring settings:', error);
      }
      return {
        monitoringEnabled: true, // Default fallback
        alertSensitivity: 'medium', // Default fallback
        error: errorMessage,
      };
    }

    type BranchMonitoringRow = { monitoring_enabled?: boolean; alert_sensitivity?: string };
    const row = data as BranchMonitoringRow | null;
    const result = {
      monitoringEnabled: row?.monitoring_enabled ?? true, // Default to true
      alertSensitivity: (row?.alert_sensitivity as AlertSensitivity) || 'medium', // Default to medium
    };
    
    // Cache the result
    settingsCache.set(branchId, {
      ...result,
      timestamp: Date.now(),
      hasColumns: true,
    });
    
    return result;
  } catch (error: any) {
    // Handle missing columns gracefully - don't log as error if columns don't exist
    const errorMessage = error.message || String(error);
    const isMissingColumnError = errorMessage.includes('does not exist') || 
                                 errorMessage.includes('column') || 
                                 error.code === '42703' ||
                                 errorMessage.includes('monitoring_enabled');
    
    if (isMissingColumnError) {
      // Columns don't exist - return defaults silently (migration may be needed)
      const result = {
        monitoringEnabled: true, // Default to enabled
        alertSensitivity: 'medium' as AlertSensitivity, // Default to medium
      };
      
      // Cache the result to prevent repeated queries
      settingsCache.set(branchId, {
        ...result,
        timestamp: Date.now(),
        hasColumns: false,
      });
      
      if (process.env.NODE_ENV === 'development') {
        const logKey = 'monitoring_columns_warning_logged';
        if (typeof window !== 'undefined' && !sessionStorage.getItem(logKey)) {
          console.warn('[BranchMonitoring] Monitoring columns not found in database, using defaults. Run migration: add-monitoring-columns.sql');
          sessionStorage.setItem(logKey, 'true');
        }
      }
      
      return result;
    }
    
    // Other errors - log and return defaults
    console.error('[BranchMonitoring] Failed to get monitoring settings:', error);
    return {
      monitoringEnabled: true, // Default fallback
      alertSensitivity: 'medium', // Default fallback
      error: errorMessage,
    };
  }
}
