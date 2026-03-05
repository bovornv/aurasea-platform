/**
 * Hospitality vertical: Thai-first labels by module type.
 * Accommodation: อัตราการเข้าพัก, ADR, รายได้ต่อห้อง
 * F&B: ยอดขาย, ต้นทุนวัตถุดิบ, กำไรขั้นต้น
 */

import type { Branch } from '../models/business-group';
import { ModuleType } from '../models/business-group';

export type ModuleFlavor = 'accommodation' | 'fnb' | null;

export function getModuleFlavor(branch: { moduleType?: string; modules?: string[] } | null): ModuleFlavor {
  if (!branch) return null;
  const type = branch.moduleType || branch.modules?.[0];
  if (type === 'accommodation' || type === ModuleType.ACCOMMODATION) return 'accommodation';
  if (type === 'fnb' || type === ModuleType.FNB) return 'fnb';
  return null;
}

export interface HospitalityLabels {
  occupancyOrSales: string;   // อัตราการเข้าพัก | ยอดขาย
  revenuePerUnit: string;     // รายได้ต่อห้อง | ยอดขาย
  costLabel: string;          // แนวโน้มต้นทุน | ต้นทุนวัตถุดิบ
  grossProfit: string;        // กำไรขั้นต้น (fnb)
  adr: string;                // ADR (accommodation)
}

const TH_ACCOMMODATION: HospitalityLabels = {
  occupancyOrSales: 'อัตราการเข้าพัก',
  revenuePerUnit: 'รายได้ต่อห้อง',
  costLabel: 'แนวโน้มต้นทุน',
  grossProfit: 'กำไรขั้นต้น',
  adr: 'ADR',
};

const TH_FNB: HospitalityLabels = {
  occupancyOrSales: 'ยอดขาย',
  revenuePerUnit: 'ยอดขาย',
  costLabel: 'ต้นทุนวัตถุดิบ',
  grossProfit: 'กำไรขั้นต้น',
  adr: 'รายได้เฉลี่ย',
};

const EN_ACCOMMODATION: HospitalityLabels = {
  occupancyOrSales: 'Occupancy',
  revenuePerUnit: 'Revenue per room',
  costLabel: 'Cost trend',
  grossProfit: 'Gross profit',
  adr: 'ADR',
};

const EN_FNB: HospitalityLabels = {
  occupancyOrSales: 'Sales',
  revenuePerUnit: 'Sales',
  costLabel: 'COGS',
  grossProfit: 'Gross profit',
  adr: 'Avg revenue',
};

export function getHospitalityLabels(branch: Branch | null, locale: 'th' | 'en'): HospitalityLabels {
  const flavor = getModuleFlavor(branch);
  if (locale === 'th') {
    return flavor === 'fnb' ? TH_FNB : TH_ACCOMMODATION;
  }
  return flavor === 'fnb' ? EN_FNB : EN_ACCOMMODATION;
}
