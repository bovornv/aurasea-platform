# Café / Restaurant Tab Design

**Status:** Design specification (UI structure, copy, layout intent)  
**Date:** 2026-02-05  
**Context:** Second operational tab within Hospitality AI, matching existing Hotel / Resort visual language

---

## 1️⃣ Navigation Structure

### Tab Switcher Location
- **Position:** Below main navigation bar, above page title
- **Visual Style:** Horizontal tabs with underline indicator (matches existing navigation pattern)
- **Spacing:** 2rem gap between tabs, 1.5rem padding top/bottom

### Tab Labels
```
┌─────────────────────────────────────────────────┐
│  Hotel / Resort  │  Café / Restaurant           │
│  ──────────────  │                               │
└─────────────────────────────────────────────────┘
```

**Active State:**
- Font weight: 500
- Color: #0a0a0a
- Border-bottom: 2px solid #0a0a0a

**Inactive State:**
- Font weight: 400
- Color: #6b7280
- Border-bottom: 2px solid transparent

**Hover State:**
- Color: #374151
- Smooth transition: 0.2s ease

### Tab Behavior
- **Same Page Layout:** Switching tabs reuses identical page structure
- **Context Switching:** Only metrics, alerts, and language context change
- **URL Pattern:** `/hospitality?tab=cafe` or `/hospitality/cafe` (implementation decision)
- **State Persistence:** Active tab persists in localStorage

---

## 2️⃣ Business Overview Card (Café / Restaurant)

### Card Structure
- **Container:** White card, 12px border-radius, 2rem padding
- **Border:** 1px solid #e5e7eb
- **Shadow:** 0 1px 2px 0 rgba(0, 0, 0, 0.05)
- **Spacing:** 2.5rem gap from other cards

### Header Section
```
┌─────────────────────────────────────────────────────┐
│ Business Overview                    [Edit]         │
│ Key metrics for your café                           │
└─────────────────────────────────────────────────────┘
```

**Title:** "Business Overview"  
**Subtitle:** "Key metrics for your café" (Thai: "ตัวชี้วัดสำคัญสำหรับร้านคาเฟ่ของคุณ")

### Metrics Grid (3 columns, equal width)

#### Metric 1: Weekly Revenue (Primary)
```
┌─────────────────────┐
│ Weekly Revenue       │
│ THB 85,000          │
└─────────────────────┘
```

**Label:** "Weekly Revenue" (Thai: "รายได้รายสัปดาห์")  
**Value:** Large, bold (28px, weight 600)  
**Format:** THB currency, whole numbers only  
**Helper Text:** "Last 7 days" (small, gray, below value)

#### Metric 2: Average Daily Revenue
```
┌─────────────────────┐
│ Avg Daily Revenue    │
│ THB 12,100          │
└─────────────────────┘
```

**Label:** "Average Daily Revenue" (Thai: "รายได้เฉลี่ยต่อวัน")  
**Value:** Large, bold (28px, weight 600)  
**Format:** THB currency, whole numbers only  
**Helper Text:** "Based on last 7 days" (small, gray, below value)

#### Metric 3: Weekend vs Weekday Ratio
```
┌─────────────────────┐
│ Weekend / Weekday   │
│ 1.8x                │
└─────────────────────┘
```

**Label:** "Weekend / Weekday Ratio" (Thai: "อัตราส่วนวันหยุด / วันธรรมดา")  
**Value:** Large, bold (28px, weight 600)  
**Format:** Decimal with "x" suffix (e.g., "1.8x", "2.3x")  
**Helper Text:** "Higher = more weekend-dependent" (small, gray, below value)

#### Metric 4: Gross Margin %
```
┌─────────────────────┐
│ Gross Margin        │
│ 62%                 │
└─────────────────────┘
```

**Label:** "Gross Margin" (Thai: "กำไรขั้นต้น")  
**Value:** Large, bold (28px, weight 600)  
**Format:** Percentage, whole numbers only  
**Helper Text:** "Revenue minus cost of goods" (small, gray, below value)

**Note:** If 4 metrics don't fit well in 3-column grid, use 2x2 grid instead.

### Edit Button
- **Position:** Top-right corner of card
- **Style:** Light gray border, white background
- **Text:** "Edit" (Thai: "แก้ไข")
- **Link:** `/hospitality/cafe/setup` (or appropriate route)

---

## 3️⃣ Monitoring Status Card (Café / Restaurant)

### Card Structure
- **Reuses:** Existing `MonitoringStatusCard` component structure
- **Same Layout:** Header, status indicator, metrics grid, action buttons

### Header
```
┌─────────────────────────────────────────────────────┐
│ Monitoring Status                                   │
│ 🟢 Tracking: Active                                │
│                                                     │
│ [Update now]  [Refresh Monitoring]                │
└─────────────────────────────────────────────────────┘
```

**Title:** "Monitoring Status" (Thai: "สถานะการติดตาม")  
**Status Labels:** Same as hotel (Active / Degraded / Stale)

### F&B-Specific Warning Banners

#### Banner 1: Weekend-Heavy Pattern
```
┌─────────────────────────────────────────────────────┐
│ ⚠️ Weekend-heavy revenue pattern detected          │
│    Weekend sales are 2.3x higher than weekdays     │
│    Consider weekday promotions to balance demand   │
└─────────────────────────────────────────────────────┘
```

**Trigger:** When weekend/weekday ratio > 1.5x  
**Color:** Orange (#f59e0b) background, dark text  
**Position:** Below status indicator, above metrics grid

#### Banner 2: Weekday Underperformance
```
┌─────────────────────────────────────────────────────┐
│ ⚠️ Weekday traffic consistently underperforming    │
│    Average weekday revenue is 40% below target      │
│    Review weekday menu and pricing strategy         │
└─────────────────────────────────────────────────────┘
```

**Trigger:** When weekday revenue < 70% of weekly average  
**Color:** Orange (#f59e0b) background, dark text  
**Position:** Below status indicator, above metrics grid

### Metrics Grid (Same Structure as Hotel)

**Row 1:**
- **Monitoring:** "Active" / "Degraded" / "Stale"
- **Data freshness:** "Fresh (2 days)" / "Aging (9 days)" / "Stale (15 days)"

**Row 2:**
- **Last update:** "Feb 3, 2026, 04:30 PM"
- **Last evaluated:** "Feb 5, 2026, 06:24 PM"

**Row 3:**
- **Data coverage:** "7 days" (café uses weekly cycles)
- **Evaluations:** "3"

### Signal Trends Section

**Title:** "Signal Trends" (Thai: "แนวโน้มสัญญาณ")

**Trend Indicators:**
```
Revenue  ↑  +12% vs last week
Cost     ↑  +5% vs last week
Margin   ↓  -3% vs last week
```

**Format:**
- Arrow indicator (↑ ↓ →)
- Percentage change
- Comparison period: "vs last week" (not "vs last month")

**Colors:**
- Green (#10b981): Positive trend
- Red (#ef4444): Negative trend
- Gray (#6b7280): Neutral/no change

---

## 4️⃣ Key Signals Section

### Card Structure
- **Title:** "Key Signals" (Thai: "สัญญาณสำคัญ")
- **Subtitle:** "The system watches these patterns automatically" (Thai: "ระบบติดตามรูปแบบเหล่านี้โดยอัตโนมัติ")
- **Layout:** Vertical list of signal cards

### Signal Cards (4 total)

#### Signal 1: Weekend–Weekday Revenue Gap
```
┌─────────────────────────────────────────────────────┐
│ Weekend–Weekday Revenue Gap                          │
│                                                      │
│ Weekend avg: THB 18,500                             │
│ Weekday avg: THB 10,200                             │
│ Gap: THB 8,300 (81% higher on weekends)            │
│                                                      │
│ Status: ⚠️ High dependency                          │
└─────────────────────────────────────────────────────┘
```

**Label:** "Weekend–Weekday Revenue Gap" (Thai: "ช่องว่างรายได้วันหยุด-วันธรรมดา")  
**Status Badge:** "High dependency" / "Balanced" / "Weekday-heavy"  
**Color:** Orange for high dependency, green for balanced

#### Signal 2: Menu Revenue Concentration
```
┌─────────────────────────────────────────────────────┐
│ Menu Revenue Concentration                           │
│                                                      │
│ Top 3 items: 68% of total revenue                   │
│ Top item: 32% of total revenue                       │
│                                                      │
│ Status: ⚠️ High concentration                        │
└─────────────────────────────────────────────────────┘
```

**Label:** "Menu Revenue Concentration" (Thai: "ความเข้มข้นของรายได้จากเมนู")  
**Status Badge:** "High concentration" / "Diversified"  
**Color:** Orange for high concentration (>60%), green for diversified

#### Signal 3: Cost Inflation
```
┌─────────────────────────────────────────────────────┐
│ Cost Inflation (Ingredients / Labor)                 │
│                                                      │
│ Ingredient costs: +8% vs last month                 │
│ Labor costs: +5% vs last month                      │
│ Combined impact: -3% margin compression             │
│                                                      │
│ Status: ⚠️ Rising costs                             │
└─────────────────────────────────────────────────────┘
```

**Label:** "Cost Inflation" (Thai: "อัตราเงินเฟ้อต้นทุน")  
**Sub-label:** "(Ingredients / Labor)" (Thai: "(วัตถุดิบ / แรงงาน)")  
**Status Badge:** "Rising costs" / "Stable" / "Declining"  
**Color:** Orange for rising, green for stable/declining

#### Signal 4: Cash Flow Volatility
```
┌─────────────────────────────────────────────────────┐
│ Cash Flow Volatility (Short-term)                   │
│                                                      │
│ Daily variance: ±15%                                 │
│ Weekly variance: ±8%                                │
│ Pattern: Weekend spikes, weekday dips               │
│                                                      │
│ Status: ℹ️ Moderate volatility                      │
└─────────────────────────────────────────────────────┘
```

**Label:** "Cash Flow Volatility" (Thai: "ความผันผวนของกระแสเงินสด")  
**Sub-label:** "(Short-term)" (Thai: "(ระยะสั้น)")  
**Status Badge:** "High volatility" / "Moderate" / "Stable"  
**Color:** Red for high, orange for moderate, green for stable

**Important:** These are **signals**, not charts. No graphs, no daily micromanagement. Simple status badges and key numbers only.

---

## 5️⃣ Alerts Summary (Café-Specific)

### Card Structure
- **Layout:** Same 4-card grid as Hotel / Resort
- **Cards:** Critical, Warning, Info, Total
- **Styling:** Identical visual treatment

### Alert Wording Examples

#### Critical Alerts
- "High dependency on weekend sales" (Thai: "พึ่งพาการขายวันหยุดสูง")
- "Margin compression: costs rising faster than revenue" (Thai: "กำไรหดตัว: ต้นทุนเพิ่มเร็วกว่ารายได้")
- "Cash flow volatility: daily swings >20%" (Thai: "ความผันผวนกระแสเงินสด: การแกว่งรายวัน >20%")

#### Warning Alerts
- "Top 3 menu items generate >60% revenue" (Thai: "เมนู 3 อันดับแรกสร้างรายได้ >60%")
- "Weekday traffic consistently below target" (Thai: "ยอดขายวันธรรมดาต่ำกว่าเป้าหมายอย่างต่อเนื่อง")
- "Ingredient costs up 10% this month" (Thai: "ต้นทุนวัตถุดิบเพิ่มขึ้น 10% ในเดือนนี้")

#### Informational Alerts
- "Weekend revenue 1.5x higher than weekdays" (Thai: "รายได้วันหยุดสูงกว่าวันธรรมดา 1.5 เท่า")
- "Menu diversification improving" (Thai: "ความหลากหลายของเมนูดีขึ้น")
- "Cash flow pattern stabilizing" (Thai: "รูปแบบกระแสเงินสดเริ่มคงที่")

**Key Principle:** All alert messages must feel café-specific. No hotel terminology (occupancy, rooms, bookings) should appear in café tab.

---

## 6️⃣ "What Happens Next" Section (F&B Version)

### Card Structure
- **Same Layout:** White card, 1.75rem padding, rounded corners
- **Title:** "What happens next" (Thai: "เกิดอะไรขึ้นต่อไป")

### Content Structure

#### Opening Paragraph
```
Hospitality AI monitors your café continuously across multiple 
areas: sales patterns, menu performance, ingredient costs, labor 
efficiency, and margin stability. When any of these signals 
drift into risk territory, you'll see alerts here — before 
problems become urgent.
```

**Thai Translation:**
```
Hospitality AI ติดตามร้านคาเฟ่ของคุณอย่างต่อเนื่องในหลายด้าน: 
รูปแบบการขาย ประสิทธิภาพเมนู ต้นทุนวัตถุดิบ ประสิทธิภาพแรงงาน 
และความมั่นคงของกำไร เมื่อสัญญาณเหล่านี้เข้าสู่เขตความเสี่ยง 
คุณจะเห็นการแจ้งเตือนที่นี่ — ก่อนที่ปัญหาจะกลายเป็นเรื่องเร่งด่วน
```

#### Bullet Points (3 items)

**Bullet 1:**
```
• You update sales & cost data weekly
```
**Thai:** "คุณอัปเดตข้อมูลการขายและต้นทุนทุกสัปดาห์"

**Bullet 2:**
```
• The system monitors:
  - Demand patterns (weekend vs weekday)
  - Menu performance (top sellers, concentration)
  - Margin stability (cost vs revenue trends)
```
**Thai:**
```
• ระบบติดตาม:
  - รูปแบบความต้องการ (วันหยุด vs วันธรรมดา)
  - ประสิทธิภาพเมนู (สินค้าขายดี, ความเข้มข้น)
  - ความมั่นคงของกำไร (แนวโน้มต้นทุน vs รายได้)
```

**Bullet 3:**
```
• Alerts surface before problems become visible
```
**Thai:** "การแจ้งเตือนปรากฏก่อนที่ปัญหาจะมองเห็นได้"

### Call-to-Action Box

```
┌─────────────────────────────────────────────────────┐
│ Your next action: Keep café sales data fresh to     │
│ maintain insight accuracy.                          │
└─────────────────────────────────────────────────────┘
```

**Background:** Light blue (#f0f9ff)  
**Border:** Blue (#bae6fd)  
**Text Color:** Dark blue (#0c4a6e)  
**Font Weight:** 500

**Thai Translation:**
```
การกระทำถัดไปของคุณ: รักษาข้อมูลการขายร้านคาเฟ่ให้ใหม่เพื่อรักษา
ความแม่นยำของข้อมูลเชิงลึก
```

### Action Button

**Text:** "Update Sales & Cost Data" (Thai: "อัปเดตข้อมูลการขายและต้นทุน")  
**Style:** Black button, white text  
**Link:** `/hospitality/cafe/data-entry` (or appropriate route)

---

## 7️⃣ Core Promise Message

### Card Structure
- **Background:** Light gray (#f9fafb)
- **Border:** 1px solid #e5e7eb
- **Padding:** 1.5rem
- **Text Align:** Center
- **Font Style:** Italic

### Message Text

**English:**
```
You don't manage dashboards here. You update sales and cost 
data weekly — and the system watches the rest.
```

**Thai:**
```
คุณไม่ต้องจัดการแดชบอร์ดที่นี่ คุณอัปเดตข้อมูลการขายและต้นทุน
ทุกสัปดาห์ — และระบบจะดูแลส่วนที่เหลือ
```

**Font:** 15px, color #374151, line-height 1.6

---

## 8️⃣ Access & Protection Logic

### Account Types

#### Café-Only Account
- **Hotel / Resort Tab:** Hidden (not disabled, completely removed from UI)
- **Café / Restaurant Tab:** Visible and active
- **Navigation:** Only shows café-related links

#### Hotel-Only Account
- **Hotel / Resort Tab:** Visible and active
- **Café / Restaurant Tab:** Hidden (not disabled, completely removed from UI)
- **Navigation:** Only shows hotel-related links

#### Dual Account (Both Hotel & Café)
- **Both Tabs:** Visible
- **Default Tab:** Based on primary business type or last visited
- **Tab Switching:** Seamless, preserves state

### Language Context Switching

**When Café Tab Active:**
- All copy uses café terminology:
  - "Sales" not "Bookings"
  - "Menu items" not "Room types"
  - "Weekend/weekday" not "Peak/off-peak"
  - "Ingredient costs" not "Fixed costs"
  - "Daily revenue" not "Occupancy rate"

**When Hotel Tab Active:**
- All copy uses hotel terminology (existing behavior)

**Important:** Never mix terminology. If café tab is active, zero hotel terms should appear anywhere on the page.

### Alert Engine

**Same Engine, Different Rulesets:**
- Both tabs use same SME OS alert engine
- Ruleset selection based on active tab:
  - Hotel tab → Hotel-specific rules (occupancy, seasonal patterns)
  - Café tab → Café-specific rules (menu concentration, weekend/weekday patterns)
- Alert filtering happens at UI layer based on active tab

---

## Visual Language Consistency

### Typography
- **Font Family:** Inter (same as Hotel tab)
- **Headings:** 18px (h2), 16px (h3), 14px (h4)
- **Body:** 15px (primary), 14px (secondary), 12px (helper)
- **Letter Spacing:** -0.01em (headings), -0.02em (large numbers)

### Colors
- **Primary Text:** #0a0a0a
- **Secondary Text:** #6b7280
- **Borders:** #e5e7eb
- **Backgrounds:** #ffffff (cards), #f9fafb (subtle)
- **Accents:** #10b981 (positive), #f59e0b (warning), #ef4444 (critical)

### Spacing
- **Card Gap:** 2.5rem vertical
- **Card Padding:** 2rem (overview), 1.75rem (monitoring), 1.5rem (other)
- **Section Gap:** 1.5rem
- **Element Gap:** 0.75rem - 1rem

### Shadows & Borders
- **Card Shadow:** 0 1px 2px 0 rgba(0, 0, 0, 0.05)
- **Hover Shadow:** 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)
- **Border Radius:** 12px (cards), 8px (buttons), 6px (small elements)

---

## Product Philosophy (Non-Negotiables)

### ✅ DO
- Simple, operational language
- Owner-friendly (Thai SME mindset)
- Decision-support focus
- Weekly update cadence
- Signal-level insights (not charts)
- Early warning system

### ❌ DON'T
- POS-style dashboards
- Daily micromanagement
- Overwhelming analytics
- Real-time charts
- Complex visualizations
- Gamification

### Core Question Answered
**"Is my café quietly drifting into trouble?"**  
**"Where should I act first?"**

---

## Implementation Notes

### File Structure (Conceptual)
```
apps/hospitality-ai/app/hospitality/
├── page.tsx                    # Main dashboard (handles tab switching)
├── cafe/
│   ├── page.tsx                # Café-specific dashboard content
│   ├── setup/
│   │   └── page.tsx            # Café business setup
│   └── data-entry/
│       └── page.tsx            # Café sales & cost data entry
└── [hotel routes remain unchanged]
```

### State Management
- **Active Tab:** Stored in URL query or localStorage
- **Business Type:** Determined from `businessSetup` context
- **Tab Visibility:** Computed from account permissions/business type

### Component Reuse
- **MonitoringStatusCard:** Reused with café-specific props
- **AlertSummaryCards:** Reused with café-specific alert filtering
- **PageLayout:** Reused with café-specific title/subtitle
- **Navigation:** Enhanced with tab switcher

---

## Summary

The Café / Restaurant tab is **the same AI, speaking café language**. It maintains visual consistency, UX patterns, and product philosophy while adapting metrics, alerts, and copy to café/restaurant context. No new product, no new page group — just a second operational view within Hospitality AI.
