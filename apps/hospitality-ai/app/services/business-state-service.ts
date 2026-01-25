// Service for fetching business state summary
import { mockSMEOS } from '../../../../core/sme-os/services/mock-sme-os';

export interface BusinessStateSummary {
  demandStatus: string;
  laborIntensityStatus: string;
  cashStressStatus: string;
  forecastReliability: string;
}

export class BusinessStateService {
  /**
   * Get business state summary from SME OS
   */
  async getSummary(): Promise<BusinessStateSummary> {
    return await mockSMEOS.getBusinessStateSummary();
  }
}

// Singleton instance
export const businessStateService = new BusinessStateService();
