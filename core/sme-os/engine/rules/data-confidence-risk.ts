import { InputContract } from '../../contracts/inputs';
import { AlertContract } from '../../contracts/alerts';
import { getBusinessType, getThresholds, isThaiSMEContext } from '../../config/threshold-profiles';

/**
 * Data Confidence Risk Alert Rule
 * Triggers when confidence falls below threshold or data freshness degrades
 * Supports Thai SME threshold calibration
 */
export class DataConfidenceRiskRule {
  evaluate(
    input: InputContract,
    lastUpdateAt: Date | null,
    currentConfidence: number,
    businessType?: 'cafe' | 'resort' | 'restaurant' | 'hotel',
    operationalSignals?: Array<{
      timestamp: Date;
    }>
  ): AlertContract | null {
    // PART 2: Add explicit data length guard (minimum 7 days)
    if (!operationalSignals || operationalSignals.length < 7) {
      return null;
    }
    
    if (!lastUpdateAt) {
      return null; // No data to assess
    }
    
    // PART 3: Explicit NaN/Infinity protection for confidence
    if (isNaN(currentConfidence) || !isFinite(currentConfidence)) {
      return null;
    }

    const today = new Date();
    const dataAgeMs = today.getTime() - lastUpdateAt.getTime();
    const dataAgeDays = Math.floor(dataAgeMs / (1000 * 60 * 60 * 24));
    
    // PART 3: Explicit NaN/Infinity protection for dataAgeDays
    if (isNaN(dataAgeDays) || !isFinite(dataAgeDays)) {
      return null;
    }
    
    // PART 3: Explicit NaN/Infinity protection
    if (isNaN(dataAgeDays) || !isFinite(dataAgeDays) || dataAgeDays < 0) {
      return null;
    }

    // Determine business type and load thresholds
    const profileBusinessType = getBusinessType(input);
    const useThaiSME = isThaiSMEContext(input);
    
    let warningDataAge: number;
    let criticalDataAge: number;
    let warningConfidence: number;
    let criticalConfidence: number;
    
    if (useThaiSME && profileBusinessType === 'fnb') {
      const thresholds = getThresholds('fnb') as { dataConfidenceWarning?: number; dataConfidenceCritical?: number };
      warningConfidence = thresholds.dataConfidenceWarning ?? 0.55;
      criticalConfidence = thresholds.dataConfidenceCritical ?? 0.45;
      
      // Data age thresholds based on business type
      warningDataAge = businessType === 'cafe' ? 5 : businessType === 'resort' ? 10 : 8;
      criticalDataAge = businessType === 'cafe' ? 10 : businessType === 'resort' ? 21 : 18;
    } else if (useThaiSME && profileBusinessType === 'accommodation') {
      // Accommodation uses same confidence thresholds (not in profile, use defaults)
      warningConfidence = 0.55;
      criticalConfidence = 0.45;
      warningDataAge = businessType === 'resort' ? 21 : 18;
      criticalDataAge = businessType === 'resort' ? 30 : 21;
    } else {
      // Use default thresholds
      warningDataAge = businessType === 'cafe' ? 7 : businessType === 'resort' ? 14 : 10;
      criticalDataAge = businessType === 'cafe' ? 14 : businessType === 'resort' ? 30 : 21;
      warningConfidence = 0.5;
      criticalConfidence = 0.4;
    }
    
    const thresholds = {
      warning: warningDataAge,
      critical: criticalDataAge,
    };

    // Check if confidence is too low
    const lowConfidence = currentConfidence < warningConfidence;
    const staleData = dataAgeDays > thresholds.warning;

    if (!lowConfidence && !staleData) {
      return null;
    }

    // PART 3: Explicit NaN/Infinity protection for calculated values
    if (isNaN(dataAgeDays) || !isFinite(dataAgeDays) ||
        isNaN(currentConfidence) || !isFinite(currentConfidence)) {
      return null;
    }
    
    // Determine severity using calibrated thresholds
    let severity: 'critical' | 'warning' | 'informational' = 'informational';
    if (currentConfidence < criticalConfidence || dataAgeDays > thresholds.critical) {
      severity = 'critical';
    } else if (currentConfidence < warningConfidence || dataAgeDays > thresholds.warning) {
      severity = 'warning';
    }

    // Determine time horizon
    let timeHorizon: 'immediate' | 'near-term' | 'medium-term' | 'long-term' = 'near-term';
    if (currentConfidence < 0.4 || dataAgeDays > thresholds.critical) {
      timeHorizon = 'immediate';
    }

    // Generate message
    let message = '';
    if (lowConfidence && staleData) {
      message = `Data confidence reduced to ${(currentConfidence * 100).toFixed(0)}% due to ${dataAgeDays}-day-old data`;
    } else if (lowConfidence) {
      message = `Data confidence below threshold at ${(currentConfidence * 100).toFixed(0)}%`;
    } else {
      message = `Data freshness degraded: last update ${dataAgeDays} days ago`;
    }

    // Contributing factors
    const contributingFactors = [];
    if (dataAgeDays > thresholds.warning) {
      const weight = thresholds.critical * 1.5 > 0 
        ? Math.min(1.0, dataAgeDays / (thresholds.critical * 1.5))
        : 1.0;
      
      // PART 3: Explicit NaN/Infinity protection
      if (!isNaN(weight) && isFinite(weight)) {
        contributingFactors.push({
          factor: 'Stale operational data',
          weight
        });
      }
    }
    if (currentConfidence < 0.5) {
      const weight = 0.3 > 0 
        ? Math.min(1.0, (0.5 - currentConfidence) / 0.3)
        : 1.0;
      
      // PART 3: Explicit NaN/Infinity protection
      if (!isNaN(weight) && isFinite(weight)) {
        contributingFactors.push({
          factor: 'Low data confidence',
          weight
        });
      }
    }

    const alert: AlertContract = {
      id: `data-confidence-risk-${Date.now()}`,
      timestamp: today,
      type: 'threshold',
      severity,
      domain: 'risk',
      timeHorizon,
      relevanceWindow: {
        start: today,
        end: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      },
      message,
      confidence: 0.85, // High confidence in the assessment itself
      contributingFactors: contributingFactors.length > 0 ? contributingFactors : [
        { factor: 'Data quality assessment', weight: 1.0 }
      ],
      conditions: [
        `Data age: ${dataAgeDays} days`,
        `Current confidence: ${(currentConfidence * 100).toFixed(0)}%`,
        `Last update: ${lastUpdateAt.toLocaleDateString()}`,
        `Business type: ${businessType || 'unknown'}`
      ]
    };

    return alert;
  }
}
