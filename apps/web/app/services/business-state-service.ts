// Service for fetching business state summary
import { mockSMEOS } from '../../../../core/sme-os/services/mock-sme-os';

export interface BusinessStateSummary {
  demandStatus: string;
  laborIntensityStatus: string;
  cashStressStatus: string;
  forecastReliability: string;
}

const DEFAULT_SUMMARY: BusinessStateSummary = {
  demandStatus: 'Unknown',
  laborIntensityStatus: 'Unknown',
  cashStressStatus: 'Unknown',
  forecastReliability: 'Unknown',
};

export class BusinessStateService {
  /**
   * Get business state summary. Production: returns neutral placeholder (no mock).
   * Development: may use mock SME OS for demos.
   */
  async getSummary(): Promise<BusinessStateSummary> {
    if (process.env.NODE_ENV === 'production') {
      return DEFAULT_SUMMARY;
    }
    return await mockSMEOS.getBusinessStateSummary();
  }
}

// Singleton instance
export const businessStateService = new BusinessStateService();
