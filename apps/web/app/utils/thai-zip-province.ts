/**
 * Thai 5-digit ZIP code → Province mapping (for Branch Settings).
 * Uses first 2 digits as prefix; valid Thai ZIPs are 10100–96270.
 */

export type Locale = 'th' | 'en';

const PROVINCE_BY_PREFIX: Record<string, { th: string; en: string }> = {
  '10': { th: 'กรุงเทพมหานคร', en: 'Bangkok' },
  '11': { th: 'นนทบุรี', en: 'Nonthaburi' },
  '12': { th: 'ปทุมธานี', en: 'Pathum Thani' },
  '13': { th: 'พระนครศรีอยุธยา', en: 'Phra Nakhon Si Ayutthaya' },
  '14': { th: 'อ่างทอง', en: 'Ang Thong' },
  '15': { th: 'ลพบุรี', en: 'Lopburi' },
  '16': { th: 'สิงห์บุรี', en: 'Sing Buri' },
  '17': { th: 'ชัยนาท', en: 'Chai Nat' },
  '18': { th: 'สระบุรี', en: 'Saraburi' },
  '20': { th: 'ฉะเชิงเทรา', en: 'Chachoengsao' },
  '21': { th: 'นครนายก', en: 'Nakhon Nayok' },
  '22': { th: 'ปราจีนบุรี', en: 'Prachinburi' },
  '23': { th: 'สระแก้ว', en: 'Sa Kaeo' },
  '24': { th: 'จันทบุรี', en: 'Chanthaburi' },
  '25': { th: 'ตราด', en: 'Trat' },
  '26': { th: 'ชลบุรี', en: 'Chonburi' },
  '27': { th: 'ระยอง', en: 'Rayong' },
  '30': { th: 'นครราชสีมา', en: 'Nakhon Ratchasima' },
  '31': { th: 'บุรีรัมย์', en: 'Buriram' },
  '32': { th: 'สุรินทร์', en: 'Surin' },
  '33': { th: 'ศรีสะเกษ', en: 'Si Sa Ket' },
  '34': { th: 'อุบลราชธานี', en: 'Ubon Ratchathani' },
  '35': { th: 'ยโสธร', en: 'Yasothon' },
  '36': { th: 'ชัยภูมิ', en: 'Chaiyaphum' },
  '37': { th: 'อำนาจเจริญ', en: 'Amnat Charoen' },
  '38': { th: 'บึงกาฬ', en: 'Bueng Kan' },
  '39': { th: 'หนองบัวลำภู', en: 'Nong Bua Lamphu' },
  '40': { th: 'ขอนแก่น', en: 'Khon Kaen' },
  '41': { th: 'อุดรธานี', en: 'Udon Thani' },
  '42': { th: 'เลย', en: 'Loei' },
  '43': { th: 'หนองคาย', en: 'Nong Khai' },
  '44': { th: 'มหาสารคาม', en: 'Maha Sarakham' },
  '45': { th: 'ร้อยเอ็ด', en: 'Roi Et' },
  '46': { th: 'กาฬสินธุ์', en: 'Kalasin' },
  '47': { th: 'สกลนคร', en: 'Sakon Nakhon' },
  '48': { th: 'นครพนม', en: 'Nakhon Phanom' },
  '49': { th: 'มุกดาหาร', en: 'Mukdahan' },
  '50': { th: 'เชียงใหม่', en: 'Chiang Mai' },
  '51': { th: 'ลำปาง', en: 'Lampang' },
  '52': { th: 'อุตรดิตถ์', en: 'Uttaradit' },
  '53': { th: 'แพร่', en: 'Phrae' },
  '54': { th: 'น่าน', en: 'Nan' },
  '55': { th: 'พะเยา', en: 'Phayao' },
  '56': { th: 'เชียงราย', en: 'Chiang Rai' },
  '57': { th: 'แม่ฮ่องสอน', en: 'Mae Hong Son' },
  '58': { th: 'ลำพูน', en: 'Lamphun' },
  '60': { th: 'นครสวรรค์', en: 'Nakhon Sawan' },
  '61': { th: 'อุทัยธานี', en: 'Uthai Thani' },
  '62': { th: 'กำแพงเพชร', en: 'Kamphaeng Phet' },
  '63': { th: 'ตาก', en: 'Tak' },
  '64': { th: 'สุโขทัย', en: 'Sukhothai' },
  '65': { th: 'พิษณุโลก', en: 'Phitsanulok' },
  '66': { th: 'พิจิตร', en: 'Phichit' },
  '67': { th: 'เพชรบูรณ์', en: 'Phetchabun' },
  '70': { th: 'ราชบุรี', en: 'Ratchaburi' },
  '71': { th: 'กาญจนบุรี', en: 'Kanchanaburi' },
  '72': { th: 'สุพรรณบุรี', en: 'Suphan Buri' },
  '73': { th: 'นครปฐม', en: 'Nakhon Pathom' },
  '74': { th: 'สมุทรสาคร', en: 'Samut Sakhon' },
  '75': { th: 'สมุทรสงคราม', en: 'Samut Songkhram' },
  '76': { th: 'เพชรบุรี', en: 'Phetchaburi' },
  '77': { th: 'ประจวบคีรีขันธ์', en: 'Prachuap Khiri Khan' },
  '80': { th: 'นครศรีธรรมราช', en: 'Nakhon Si Thammarat' },
  '81': { th: 'กระบี่', en: 'Krabi' },
  '82': { th: 'พังงา', en: 'Phang Nga' },
  '83': { th: 'ภูเก็ต', en: 'Phuket' },
  '84': { th: 'สุราษฎร์ธานี', en: 'Surat Thani' },
  '85': { th: 'ระนอง', en: 'Ranong' },
  '86': { th: 'ชุมพร', en: 'Chumphon' },
  '90': { th: 'สงขลา', en: 'Songkhla' },
  '91': { th: 'สตูล', en: 'Satun' },
  '92': { th: 'ตรัง', en: 'Trang' },
  '93': { th: 'พัทลุง', en: 'Phatthalung' },
  '94': { th: 'ปัตตานี', en: 'Pattani' },
  '95': { th: 'ยะลา', en: 'Yala' },
  '96': { th: 'นราธิวาส', en: 'Narathiwat' },
};

/**
 * Returns province name for a valid 5-digit Thai ZIP, or null if invalid/unknown.
 */
export function getProvinceFromZip(zipCode: string, locale: Locale = 'en'): string | null {
  const cleaned = String(zipCode).replace(/\D/g, '');
  if (cleaned.length !== 5) return null;
  const prefix = cleaned.slice(0, 2);
  const entry = PROVINCE_BY_PREFIX[prefix];
  if (!entry) return null;
  return entry[locale];
}

/**
 * Validates Thai ZIP: exactly 5 digits.
 */
export function isValidThaiZip(zipCode: string): boolean {
  return /^\d{5}$/.test(String(zipCode).trim());
}
