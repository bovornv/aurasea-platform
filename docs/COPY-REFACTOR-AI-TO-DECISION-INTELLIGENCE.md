# Copy refactor: AI/hype → Decision Intelligence / Operating Clarity

Summary of replaced phrases and locations. Tone shifted to: Decision Intelligence, Operating Clarity, operator-built, practical, no AI/ML/predictive/automation hype.

---

## 1. Login & access

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `login.subtitle` | Access your decision intelligence dashboard | See what matters. Sign in. |
| `i18n/translations.ts` (th) `login.subtitle` | เข้าถึงแดชบอร์ดการตัดสินใจอัจฉริยะของคุณ | ดูสิ่งที่สำคัญ เข้าสู่ระบบ |

---

## 2. Onboarding headline, subheadline, positioning

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `setup.subtitle` | This helps us understand your business better | We use this to show you what matters. No system replacement required. |
| `i18n/translations.ts` (en) `setup.positioningLine` | (new) | AuraSea works alongside your existing systems. No system replacement required. |
| `i18n/translations.ts` (th) `setup.subtitle` | สิ่งนี้ช่วยให้เราเข้าใจธุรกิจของคุณได้ดีขึ้น | เราใช้ข้อมูลนี้เพื่อแสดงสิ่งที่สำคัญ ไม่ต้องเปลี่ยนระบบเดิม |
| `i18n/translations.ts` (th) `setup.positioningLine` | (new) | AuraSea ทำงานร่วมกับระบบที่มีอยู่ของคุณ ไม่ต้องเปลี่ยนระบบ |
| `hospitality/setup/page.tsx` | — | Renders `setup.positioningLine` below subtitle (new) |

---

## 3. Setup tooltips / helpers

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `setup.businessTypeChangeNote` | Changing your business type may adjust available insights and alerts. | Changing your business type may adjust which flags and alerts you see. |
| `i18n/translations.ts` (en) `setup.revenueSourcesHelper` | This helps the system fine-tune insights — it does not change your business type. | This tunes which flags you see. It does not change your business type. |
| `i18n/translations.ts` (th) `setup.businessTypeChangeNote` | การเปลี่ยนประเภทธุรกิจอาจปรับเปลี่ยนข้อมูลเชิงลึกและการแจ้งเตือนที่มีให้ | การเปลี่ยนประเภทธุรกิจอาจปรับการแจ้งเตือนและธงที่คุณเห็น |
| `i18n/translations.ts` (th) `setup.revenueSourcesHelper` | สิ่งนี้ช่วยให้ระบบปรับแต่งข้อมูลเชิงลึกให้ละเอียดขึ้น — ไม่ได้เปลี่ยนประเภทธุรกิจของคุณ | ใช้ปรับว่าคุณจะเห็นธงใด ไม่ได้เปลี่ยนประเภทธุรกิจ |

---

## 4. Data entry success (AI analysis complete → Synced)

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `dataEntry.success` | Data saved successfully. Monitoring evaluation in progress... | Updated with latest data. |
| `i18n/translations.ts` (en) `dataEntry.successTitle` | (Thai text in EN block) | Synced with your latest numbers. |
| `i18n/translations.ts` (en) `dataEntry.successBullet1` | Your data is used to evaluate risk. | (unchanged meaning) |
| `i18n/translations.ts` (en) `dataEntry.successBullet2` | The system evaluates cash, demand, and cost trends daily | Signals are evaluated against your thresholds. |
| `i18n/translations.ts` (en) `dataEntry.successBullet3` | Alerts appear automatically across multiple categories | Flags update when patterns match your data. |
| `i18n/translations.ts` (en) `dataEntry.successNote` | The more you update, the more accurate. | Update regularly for clearer view. |
| `i18n/translations.ts` (th) same keys | Thai equivalents of above | Thai equivalents of new EN copy |

---

## 5. Dashboard / Operations Overview

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `nav.hospitality` | Dashboard | Operations Overview |
| `i18n/translations.ts` (en) `hospitality.dashboard.title` | Dashboard | Operations Overview |
| `i18n/translations.ts` (en) `hospitality.dashboard.subtitle` | Risk monitoring for hospitality businesses | Operating clarity for your business |
| `i18n/translations.ts` (en) `hospitality.dashboard.lastEvaluated` | Last evaluated | Last updated |
| `i18n/translations.ts` (en) `hospitality.dashboard.notEvaluatedYet` | Not evaluated yet | Pending your data |
| `i18n/translations.ts` (th) same keys | Thai equivalents | Thai equivalents |

---

## 6. What happens next (welcome / value prop)

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `hospitality.dashboard.whatHappensNextDescription` | The platform monitors your business continuously... When signals drift into risk territory, you'll see alerts here — before problems become urgent. | AuraSea sits above your existing systems and helps you see what matters. We look at cash flow, demand, costs, and margins. When signals cross your thresholds, you see flags here. |
| `i18n/translations.ts` (en) `whatHappensNextBullet1` | You update operational data weekly (or sooner if conditions change) | You update operational data weekly (or when things change) |
| `i18n/translations.ts` (en) `whatHappensNextBullet2` | The system evaluates cash, demand, and cost trends daily | Your data is evaluated against defined thresholds |
| `i18n/translations.ts` (en) `whatHappensNextBullet3` | Alerts appear automatically across multiple categories: Cash, Demand, and Cost | Flags appear when patterns match: Cash, Demand, Cost |
| `i18n/translations.ts` (en) `whatHappensNextNote` | You can explore scenarios anytime, but alerts are generated automatically. | Explore scenarios anytime. Flags update when you add new data. |
| `i18n/translations.ts` (th) same keys | Thai equivalents | Thai equivalents (incl. new bullets) |

---

## 7. Alerts / flags

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `hospitality.alerts.subtitle` | All alerts from SME OS | Flags from your operations |
| `i18n/translations.ts` (en) `hospitality.alerts.subtitleWithCount` | {count} alert{plural} from SME OS | {count} flag{plural} from your operations |
| `i18n/translations.ts` (en) `hospitality.alerts.noAlertsDesc` | No alerts detected at this time. Your business appears to be operating normally. | No flags at this time. Operations within your thresholds. |
| `i18n/translations.ts` (en) `alertDetail.causedByIntro` | This alert was generated based on analysis of current business patterns and trends. | This alert is based on your data and observed patterns. |
| `i18n/translations.ts` (en) `alertDetail.notFoundDescription` | was generated from a previous session | was created in a previous session |
| `i18n/translations.ts` (th) same keys | Thai equivalents | Thai equivalents |

---

## 8. Home / empty states

| Location | Before | After |
|----------|--------|--------|
| `i18n/translations.ts` (en) `home.subtitle` | Critical insights requiring attention | Items that need your attention |
| `i18n/translations.ts` (en) `home.noAlertsDesc` | All systems operating normally. Check the Alerts page for informational items. | No flags at this time. Operations within your thresholds. |
| `i18n/translations.ts` (en) `home.systemStable` | System stable | Within thresholds |
| `i18n/translations.ts` (en) `alerts.noAlertsDesc` | New alerts will appear here when detected | Flags appear here when patterns match your data |
| `i18n/translations.ts` (th) same keys | Thai equivalents | Thai equivalents |

---

## 9. Go to Dashboard → Go to overview

| Location | Before | After |
|----------|--------|--------|
| `invite/accept/page.tsx` | Go to Dashboard | Go to overview |
| `layout.tsx` | title: 'Dashboard' | title: 'AuraSea' |
| `update-data/hotel-resort/page.tsx` | Redirecting to dashboard... | Redirecting to overview... |
| `update-data/cafe-restaurant/page.tsx` | (same) | (same) |
| `hotel/update-operational-data/page.tsx` | (same) | (same) |
| `cafe/update-operational-data/page.tsx` | (same) | (same) |
| `hospitality/data-entry-fnb/page.tsx` | (same) | (same) |
| `unauthorized/page.tsx` | Go to Dashboard | Go to overview |
| `hospitality/alerts/[id]/page.tsx` | แดชบอร์ด / Dashboard | ภาพรวม / Overview |
| `branch/history/page.tsx` | ไปที่แดชบอร์ด / Go to Dashboard | ไปที่ภาพรวม / Go to overview |
| `hooks/use-keyboard-shortcuts.ts` | description: 'Go to dashboard' | description: 'Go to overview' |
| Thai redirect strings (5 files) | กำลังนำคุณไปยังแดชบอร์ด... | กำลังนำคุณไปยังภาพรวม... |

---

## 10. Recommendations → Suggested actions

| Location | Before | After |
|----------|--------|--------|
| `branch/overview/page.tsx` | Review alert details for additional recommendations | Review alert details for suggested actions |
| `branch/overview/page.tsx` | No recommendations at this time | No suggested actions at this time (ไทย: ยังไม่มีแนวทางที่แนะนำในขณะนี้) |
| `branch/overview/page.tsx` (comment) | no recommendations | no suggested actions |
| `components/portfolio/portfolio-revenue-leaks.tsx` | Review alert details for recommendations | Review alert details for suggested actions (ไทย: ตรวจสอบรายละเอียดการแจ้งเตือนสำหรับแนวทางที่แนะนำ) |

---

## 11. Onboarding checklist

| Location | Before | After |
|----------|--------|--------|
| `onboarding-checklist.tsx` Step 1 description | Specify business type, name, and basic financial information | Specify business type, name, and revenue sources |
| `onboarding-checklist.tsx` Step 2 description | Current cash balance, monthly fixed costs, and revenue sources | Business profile and revenue sources |
| `onboarding-checklist.tsx` Step 3 description | Submit your first operational update to start automatic monitoring | Submit your first operational update to start monitoring |

---

## Phrases not used (per guidelines)

- AI, AI assistant, AI insights, AI-powered  
- Machine learning, predictive analytics  
- Automation hype, futuristic language  
- Transform your business, revolutionary  
- Emojis in new copy (existing icons in setup left as-is)

---

## Value proposition in copy

- **Login:** "See what matters. Sign in."
- **Onboarding:** "AuraSea works alongside your existing systems. No system replacement required."
- **Dashboard welcome:** "AuraSea sits above your existing systems and helps you see what matters."
