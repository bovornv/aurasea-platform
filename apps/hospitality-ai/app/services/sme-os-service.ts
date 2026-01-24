// Service layer for calling SME OS
// This is the boundary between Hospitality AI and SME OS

import { mockSMEOS } from '../../../../core/sme-os/services/mock-sme-os';
import type { InputContract } from '../../../../core/sme-os/contracts/inputs';
import type { OutputContract } from '../../../../core/sme-os/contracts/outputs';
import type { AlertContract } from '../../../../core/sme-os/contracts/alerts';
import { translateToSMEOS, translateOutputFromSMEOS } from '../adapters/hospitality-adapter';
import type { HospitalityInput } from '../adapters/hospitality-adapter';

/**
 * Service for interacting with SME OS
 * This is the only place Hospitality AI calls SME OS
 */
export class SMEOSService {
  /**
   * Evaluate a hospitality scenario using SME OS
   */
  async evaluateScenario(input: HospitalityInput): Promise<OutputContract> {
    // Translate hospitality input to SME OS contract
    const smeOSInput = translateToSMEOS(input);
    
    // Call SME OS (currently mocked)
    const output = await mockSMEOS.evaluate(smeOSInput);
    
    return output;
  }

  /**
   * Get alerts from SME OS
   */
  async getAlerts(): Promise<AlertContract[]> {
    return await mockSMEOS.getAlerts();
  }
}

// Singleton instance
export const smeOSService = new SMEOSService();
