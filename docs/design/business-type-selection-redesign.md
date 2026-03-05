# Business Type Selection Redesign

**Status:** Design specification (UI structure, copy, layout intent)  
**Date:** 2026-02-05  
**Context:** Redesign of Business Information screen to better reflect how owners identify their business

---

## 1️⃣ Replace Current Business Type Dropdown

### Current State
- Dropdown with 4 separate options: Hotel, Resort, Café, Restaurant
- Treated as mutually exclusive categories
- Doesn't reflect hybrid businesses (hotel with café)

### New Design: Primary Business Type Selection

**Visual Style:** Radio button group (not dropdown) for clarity and trust

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ What kind of business do you run?                   │
│                                                     │
│  ○ ☕ Café / Restaurant                            │
│  ○ 🏨 Hotel / Resort                               │
│  ○ 🏨 + ☕ Hotel with Café / Restaurant            │
│  ○ 🧪 Other                                        │
│                                                     │
│  [Helper text explaining selection]                │
└─────────────────────────────────────────────────────┘
```

### Option Details

#### Option 1: ☕ Café / Restaurant
**Label:** "Café / Restaurant" (Thai: "คาเฟ่ / ร้านอาหาร")  
**Description (helper text):** "Coffee shops, restaurants, bars, or food service businesses"  
**Value:** `cafe_restaurant`  
**Icon:** ☕ (coffee cup emoji)

#### Option 2: 🏨 Hotel / Resort
**Label:** "Hotel / Resort" (Thai: "โรงแรม / รีสอร์ท")  
**Description (helper text):** "Accommodation-focused businesses with rooms or villas"  
**Value:** `hotel_resort`  
**Icon:** 🏨 (hotel emoji)

#### Option 3: 🏨 + ☕ Hotel with Café / Restaurant
**Label:** "Hotel with Café / Restaurant" (Thai: "โรงแรมที่มีคาเฟ่ / ร้านอาหาร")  
**Description (helper text):** "Hotels or resorts that also operate a café, restaurant, or bar"  
**Value:** `hotel_with_cafe`  
**Icon:** 🏨 + ☕ (combined icons)  
**Note:** This is the key addition - recognizes hybrid businesses

#### Option 4: 🧪 Other
**Label:** "Other" (Thai: "อื่น ๆ")  
**Description (helper text):** "Different business model or not sure yet"  
**Value:** `other`  
**Icon:** 🧪 (test tube emoji - suggests experimentation/exploration)

### Visual Treatment

**Radio Button Style:**
- Large, touch-friendly (min 44px height)
- Clear visual hierarchy
- Icons provide quick visual recognition
- Selected state: Bold border, subtle background tint (#f0f9ff)
- Hover state: Light background (#f9fafb)

**Spacing:**
- 1rem gap between options
- 0.75rem padding inside each option card
- 1rem margin below helper text

---

## 2️⃣ Behavior Rules

### Initial Selection (Onboarding)

**Context:** First-time business setup

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Tell us about your business                        │
│                                                     │
│ [Business Type Radio Group]                         │
│                                                     │
│ [Business Name Input]                              │
│ [Cash Balance Input]                                │
│ [Fixed Costs Input]                                 │
│                                                     │
│ [Revenue Sources Checkboxes]                        │
│                                                     │
│ [Continue Button]                                   │
└─────────────────────────────────────────────────────┘
```

**Copy:**
- **Title:** "Tell us about your business" (Thai: "บอกเราเกี่ยวกับธุรกิจของคุณ")
- **Subtitle:** "This helps us understand your business better" (Thai: "สิ่งนี้ช่วยให้เราเข้าใจธุรกิจของคุณได้ดีขึ้น")
- **No trust note needed** (first-time setup is expected)

### Edit Mode (Changing Later)

**Context:** User editing existing business information

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Edit Business Information                           │
│                                                     │
│ [Business Type Radio Group - Pre-selected]         │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ ℹ️ Changing your business type may adjust   │   │
│ │    available insights and alerts.           │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ [Business Name Input]                              │
│ [Cash Balance Input]                                │
│ [Fixed Costs Input]                                 │
│                                                     │
│ [Revenue Sources Checkboxes]                        │
│                                                     │
│ [Save Changes Button]                               │
└─────────────────────────────────────────────────────┘
```

**Trust Note Design:**
- **Background:** Light blue (#f0f9ff)
- **Border:** Blue (#bae6fd)
- **Icon:** ℹ️ (info icon)
- **Text:** "Changing your business type may adjust available insights and alerts." (Thai: "การเปลี่ยนประเภทธุรกิจอาจปรับเปลี่ยนข้อมูลเชิงลึกและการแจ้งเตือนที่มีให้")
- **Tone:** Informative, not warning
- **Position:** Directly below Business Type selection

**Behavior:**
- Show trust note only when business type is changed (not on initial load)
- Dismissible? No - it's informational, not intrusive
- Appears immediately when user selects different option

---

## 3️⃣ Platform Logic (UI-Level Only)

### Tab Visibility Rules

**Mapping Business Type → Tabs:**

| Business Type | Hotel Tab | Café Tab |
|--------------|-----------|----------|
| `cafe_restaurant` | ❌ Hidden | ✅ Visible |
| `hotel_resort` | ✅ Visible | ❌ Hidden |
| `hotel_with_cafe` | ✅ Visible | ✅ Visible |
| `other` | ✅ Visible | ✅ Visible (default to both for exploration) |

**Implementation Note:**
- Hide tabs completely (don't disable)
- No visual indication that tabs are hidden
- Seamless experience - user only sees relevant tabs

### Alert Category Filtering

**Café / Restaurant Business:**
- Show: Menu concentration, Weekend/weekday patterns, Cost inflation, Cash flow volatility
- Hide: Occupancy alerts, Seasonal booking patterns (unless relevant)
- Language: "Sales", "Menu items", "Weekend/weekday", "Ingredient costs"

**Hotel / Resort Business:**
- Show: Occupancy alerts, Seasonal patterns, Revenue concentration, Cash runway
- Hide: Menu concentration, Weekend/weekday revenue gaps
- Language: "Bookings", "Occupancy", "Peak/off-peak", "Room revenue"

**Hotel with Café / Restaurant:**
- Show: All alert categories
- Language: Context-aware (use hotel terms for hotel alerts, café terms for café alerts)

**Other:**
- Show: Generic alerts (cash flow, cost pressure, margin compression)
- Language: Neutral terms

### Wording Adaptation

**When Café Tab Active:**
- "Sales" not "Bookings"
- "Menu items" not "Room types"
- "Weekend/weekday" not "Peak/off-peak"
- "Ingredient costs" not "Fixed costs"
- "Daily revenue" not "Occupancy rate"

**When Hotel Tab Active:**
- "Bookings" not "Sales"
- "Occupancy" not "Traffic"
- "Peak/off-peak" not "Weekend/weekday"
- "Room revenue" not "Menu revenue"

**Key Principle:** Zero mixing. If café tab is active, zero hotel terminology appears anywhere.

---

## 4️⃣ Revenue Sources Section

### Current State
- Multi-select checkboxes
- Treated as primary business identifier (confusing)

### New Design: Secondary Information

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Primary Revenue Sources                             │
│                                                     │
│  ☑ Rooms / Accommodation                           │
│  ☐ Food / Dining                                    │
│  ☑ Beverages / Bar                                 │
│  ☐ Other                                           │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ This helps the system fine-tune insights —  │   │
│  │ it does not change your business type.      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Visual Treatment:**
- Smaller font size (14px vs 15px for Business Type)
- Lighter visual weight
- Positioned below Business Type (secondary importance)
- Helper text in subtle gray box

**Helper Text:**
- **English:** "This helps the system fine-tune insights — it does not change your business type."
- **Thai:** "สิ่งนี้ช่วยให้ระบบปรับแต่งข้อมูลเชิงลึกให้ละเอียดขึ้น — ไม่ได้เปลี่ยนประเภทธุรกิจของคุณ"
- **Style:** Italic, smaller font (13px), gray (#6b7280)
- **Background:** Light gray (#f9fafb) with subtle border

**Checkbox Options:**
1. **Rooms / Accommodation** (Thai: "ห้องพัก / ที่พัก")
2. **Food / Dining** (Thai: "อาหาร / ร้านอาหาร")
3. **Beverages / Bar** (Thai: "เครื่องดื่ม / บาร์")
4. **Other** (Thai: "อื่น ๆ")

**Validation:**
- At least one revenue source required
- Error message: "Please select at least one revenue source" (Thai: "กรุณาเลือกแหล่งรายได้อย่างน้อยหนึ่งรายการ")

---

## 5️⃣ UX Tone & Language

### Principles

**Simple:**
- Short, clear labels
- No jargon
- Owner-friendly language

**Non-Technical:**
- Avoid: "Configure", "System", "Parameters", "Settings"
- Use: "Tell us", "Help us understand", "Your business"

**Owner-First:**
- Frame from owner's perspective
- "What kind of business do you run?" not "Select business category"
- "This helps us understand" not "Required for system configuration"

**Trust-Building:**
- Transparent about what happens
- Explain why we ask
- Reassure about changes

### Copy Examples

#### Business Type Label
**Good:** "What kind of business do you run?" (Thai: "คุณทำธุรกิจประเภทไหน?")  
**Bad:** "Business Category" or "Select Business Type"

#### Helper Text (Business Type)
**Good:** "Choose the option that best describes your business" (Thai: "เลือกตัวเลือกที่อธิบายธุรกิจของคุณได้ดีที่สุด")  
**Bad:** "Required field" or "Select from dropdown"

#### Trust Note (Edit Mode)
**Good:** "Changing your business type may adjust available insights and alerts." (Thai: "การเปลี่ยนประเภทธุรกิจอาจปรับเปลี่ยนข้อมูลเชิงลึกและการแจ้งเตือนที่มีให้")  
**Bad:** "Warning: Changing business type will reset your configuration" or "This action cannot be undone"

#### Revenue Sources Helper
**Good:** "This helps the system fine-tune insights — it does not change your business type." (Thai: "สิ่งนี้ช่วยให้ระบบปรับแต่งข้อมูลเชิงลึกให้ละเอียดขึ้น — ไม่ได้เปลี่ยนประเภทธุรกิจของคุณ")  
**Bad:** "Select revenue streams" or "Configure revenue sources"

---

## 6️⃣ Complete Form Layout

### Onboarding Flow

```
┌─────────────────────────────────────────────────────┐
│ Tell us about your business                        │
│ This helps us understand your business better      │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ What kind of business do you run? *                │
│                                                     │
│  ○ ☕ Café / Restaurant                            │
│     Coffee shops, restaurants, bars, or food       │
│     service businesses                             │
│                                                     │
│  ○ 🏨 Hotel / Resort                               │
│     Accommodation-focused businesses with rooms    │
│     or villas                                       │
│                                                     │
│  ○ 🏨 + ☕ Hotel with Café / Restaurant            │
│     Hotels or resorts that also operate a café,    │
│     restaurant, or bar                             │
│                                                     │
│  ○ 🧪 Other                                        │
│     Different business model or not sure yet       │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ Business Name *                                    │
│ [___________________________]                       │
│                                                     │
│ Current Cash Balance (THB) *                       │
│ [___________________________]                       │
│ Your current available cash in the bank            │
│                                                     │
│ Monthly Fixed Costs (THB) *                        │
│ [___________________________]                       │
│ Rent, salaries, and other fixed monthly expenses   │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ Primary Revenue Sources                            │
│                                                     │
│  ☐ Rooms / Accommodation                           │
│  ☐ Food / Dining                                    │
│  ☐ Beverages / Bar                                 │
│  ☐ Other                                           │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ This helps the system fine-tune insights —  │   │
│  │ it does not change your business type.      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│ [Continue]                                         │
└─────────────────────────────────────────────────────┘
```

### Edit Mode Flow

```
┌─────────────────────────────────────────────────────┐
│ Edit Business Information                           │
│ Update your business details                       │
│                                                     │
│ ─────────────────────────────────────────────────  │
│                                                     │
│ What kind of business do you run? *                │
│                                                     │
│  ● 🏨 Hotel / Resort                               │
│     Accommodation-focused businesses with rooms    │
│     or villas                                       │
│                                                     │
│  ○ ☕ Café / Restaurant                            │
│     Coffee shops, restaurants, bars, or food       │
│     service businesses                             │
│                                                     │
│  ○ 🏨 + ☕ Hotel with Café / Restaurant            │
│     Hotels or resorts that also operate a café,    │
│     restaurant, or bar                             │
│                                                     │
│  ○ 🧪 Other                                        │
│     Different business model or not sure yet       │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ ℹ️ Changing your business type may adjust   │   │
│  │    available insights and alerts.           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│ [Rest of form fields...]                           │
│                                                     │
│ [Save Changes]                                     │
└─────────────────────────────────────────────────────┘
```

**Note:** Trust note appears only when user changes selection (not on initial load of edit page).

---

## 7️⃣ Visual Specifications

### Radio Button Cards

**Unselected State:**
- Border: 1px solid #e5e7eb
- Background: #ffffff
- Padding: 1rem
- Border-radius: 8px
- Cursor: pointer
- Transition: all 0.2s ease

**Selected State:**
- Border: 2px solid #0a0a0a
- Background: #ffffff
- Padding: 1rem
- Border-radius: 8px
- Font weight: 500 (for label text)

**Hover State:**
- Border: 1px solid #d1d5db
- Background: #f9fafb
- Box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05)

**Focus State:**
- Outline: 2px solid #3b82f6
- Outline-offset: 2px

### Radio Button Element

**Size:** 20px diameter  
**Color:** #0a0a0a (selected), #d1d5db (unselected)  
**Position:** Left side of card, vertically centered  
**Spacing:** 0.75rem gap between radio and label

### Icons

**Size:** 24px × 24px  
**Position:** Left of label text  
**Spacing:** 0.5rem gap between icon and label  
**Style:** Emoji (native) or SVG icons matching emoji style

### Typography

**Label (Option Text):**
- Font size: 15px
- Font weight: 400 (unselected), 500 (selected)
- Color: #374151
- Line height: 1.5

**Description Text:**
- Font size: 13px
- Font weight: 400
- Color: #6b7280
- Line height: 1.5
- Margin-top: 0.25rem

**Helper Text (Revenue Sources):**
- Font size: 13px
- Font weight: 400
- Font style: Italic
- Color: #6b7280
- Background: #f9fafb
- Border: 1px solid #e5e7eb
- Padding: 0.75rem 1rem
- Border-radius: 6px
- Margin-top: 0.5rem

### Spacing

**Section Gap:** 2rem  
**Option Gap:** 1rem  
**Label Margin:** 0.75rem bottom  
**Helper Text Margin:** 0.5rem top

---

## 8️⃣ Interaction States

### Selection Flow

1. **Initial State:** No option selected (onboarding) or current option selected (edit mode)
2. **Hover:** Light background, border darkens
3. **Click:** Option becomes selected, border becomes bold
4. **Edit Mode Change:** Trust note appears below selection
5. **Validation:** Error message appears if no selection on submit

### Trust Note Behavior

**Trigger:** User selects different option than current  
**Appearance:** Smooth fade-in (0.2s ease)  
**Dismissal:** No dismiss button - informational only  
**Persistence:** Stays visible until user changes selection again or submits

### Form Validation

**Business Type:**
- Required field
- Error: "Please select a business type" (Thai: "กรุณาเลือกประเภทธุรกิจ")
- Error style: Red border (#dc2626), red text below field

**Revenue Sources:**
- At least one required
- Error: "Please select at least one revenue source" (Thai: "กรุณาเลือกแหล่งรายได้อย่างน้อยหนึ่งรายการ")
- Error style: Red text below checkbox group

---

## 9️⃣ Mobile Responsiveness

### Radio Button Cards

**Desktop:** Full width (max 600px container)  
**Mobile:** Full width, no max-width constraint  
**Touch Target:** Minimum 44px height per option  
**Spacing:** 0.75rem gap between options (reduced from 1rem on mobile)

### Icons & Text

**Mobile:** Icons remain 24px, text scales appropriately  
**Stacking:** Label and description stack vertically on very small screens  
**Helper Text:** Full width, wraps naturally

---

## 🔟 Translation Keys (Reference)

### English Keys

```typescript
setup: {
  businessType: 'What kind of business do you run?',
  businessTypeCafeRestaurant: 'Café / Restaurant',
  businessTypeCafeRestaurantDesc: 'Coffee shops, restaurants, bars, or food service businesses',
  businessTypeHotelResort: 'Hotel / Resort',
  businessTypeHotelResortDesc: 'Accommodation-focused businesses with rooms or villas',
  businessTypeHotelWithCafe: 'Hotel with Café / Restaurant',
  businessTypeHotelWithCafeDesc: 'Hotels or resorts that also operate a café, restaurant, or bar',
  businessTypeOther: 'Other',
  businessTypeOtherDesc: 'Different business model or not sure yet',
  businessTypeChangeNote: 'Changing your business type may adjust available insights and alerts.',
  revenueSources: 'Primary Revenue Sources',
  revenueSourcesHelper: 'This helps the system fine-tune insights — it does not change your business type.',
  // ... existing keys
}
```

### Thai Keys

```typescript
setup: {
  businessType: 'คุณทำธุรกิจประเภทไหน?',
  businessTypeCafeRestaurant: 'คาเฟ่ / ร้านอาหาร',
  businessTypeCafeRestaurantDesc: 'ร้านกาแฟ ร้านอาหาร บาร์ หรือธุรกิจบริการอาหาร',
  businessTypeHotelResort: 'โรงแรม / รีสอร์ท',
  businessTypeHotelResortDesc: 'ธุรกิจที่เน้นที่พักพร้อมห้องพักหรือวิลล่า',
  businessTypeHotelWithCafe: 'โรงแรมที่มีคาเฟ่ / ร้านอาหาร',
  businessTypeHotelWithCafeDesc: 'โรงแรมหรือรีสอร์ทที่ยังดำเนินการคาเฟ่ ร้านอาหาร หรือบาร์',
  businessTypeOther: 'อื่น ๆ',
  businessTypeOtherDesc: 'โมเดลธุรกิจที่แตกต่างหรือยังไม่แน่ใจ',
  businessTypeChangeNote: 'การเปลี่ยนประเภทธุรกิจอาจปรับเปลี่ยนข้อมูลเชิงลึกและการแจ้งเตือนที่มีให้',
  revenueSources: 'แหล่งรายได้หลัก',
  revenueSourcesHelper: 'สิ่งนี้ช่วยให้ระบบปรับแต่งข้อมูลเชิงลึกให้ละเอียดขึ้น — ไม่ได้เปลี่ยนประเภทธุรกิจของคุณ',
  // ... existing keys
}
```

---

## 1️⃣1️⃣ Implementation Mapping

### Business Type Values

| Display Option | Internal Value | Tab Visibility |
|----------------|----------------|-----------------|
| ☕ Café / Restaurant | `cafe_restaurant` | Café only |
| 🏨 Hotel / Resort | `hotel_resort` | Hotel only |
| 🏨 + ☕ Hotel with Café | `hotel_with_cafe` | Both tabs |
| 🧪 Other | `other` | Both tabs (default) |

### Backward Compatibility

**Migration from Old Values:**
- `hotel` → `hotel_resort`
- `resort` → `hotel_resort`
- `cafe` → `cafe_restaurant`
- `restaurant` → `cafe_restaurant`

**Note:** This is UI-level mapping only. Backend can maintain existing values if needed.

---

## 1️⃣2️⃣ User Flow Examples

### Example 1: Café Owner (First Time)

1. User lands on Business Setup page
2. Sees 4 radio options
3. Selects "☕ Café / Restaurant"
4. Fills in business name, cash, costs
5. Selects revenue sources: ☑ Food, ☑ Beverages
6. Clicks "Continue"
7. Redirected to dashboard
8. **Sees only Café / Restaurant tab** (Hotel tab hidden)
9. All metrics and alerts use café terminology

### Example 2: Hotel Owner Editing to Add Café

1. User on dashboard (Hotel tab visible)
2. Clicks "Edit Business Information"
3. Sees current selection: "🏨 Hotel / Resort" (selected)
4. Changes to "🏨 + ☕ Hotel with Café / Restaurant"
5. **Trust note appears:** "Changing your business type may adjust available insights and alerts."
6. Updates revenue sources: ☑ Rooms, ☑ Food, ☑ Beverages
7. Clicks "Save Changes"
8. Redirected to dashboard
9. **Both tabs now visible:** Hotel / Resort and Café / Restaurant
10. Can switch between tabs to see different metrics

### Example 3: Hybrid Business Owner (First Time)

1. User owns hotel with restaurant
2. Selects "🏨 + ☕ Hotel with Café / Restaurant"
3. Completes setup
4. **Both tabs visible from start**
5. Can view hotel metrics OR café metrics OR both

---

## 1️⃣3️⃣ Edge Cases

### User Selects "Other"

**Behavior:**
- Show both tabs (allow exploration)
- Use generic/neutral terminology
- Don't filter alerts (show all categories)
- Helper text: "You can change this later if needed"

### User Changes from "Hotel + Café" to "Café Only"

**Behavior:**
- Hotel tab disappears immediately
- Café tab remains visible
- Trust note appears
- Alert categories filter to café-only
- No data loss (historical data preserved)

### User Changes from "Café" to "Hotel + Café"

**Behavior:**
- Hotel tab appears immediately
- Café tab remains visible
- Both tabs now available
- Alert categories expand to include hotel alerts
- Trust note appears

---

## 1️⃣4️⃣ Success Criteria

### User Understanding

✅ User can identify their business type immediately  
✅ User understands difference between Business Type and Revenue Sources  
✅ User feels confident changing business type later  
✅ User trusts that changes won't break anything

### Platform Behavior

✅ Correct tabs appear based on selection  
✅ Correct terminology used throughout  
✅ Alert categories match business type  
✅ No irrelevant content shown

### Visual Clarity

✅ Radio buttons are clear and accessible  
✅ Icons provide quick recognition  
✅ Helper text clarifies purpose  
✅ Trust note is informative, not alarming

---

## Summary

The redesigned Business Type Selection:

1. **Reflects real business models** - Includes hybrid "Hotel with Café" option
2. **Uses owner language** - "What kind of business do you run?" not "Select category"
3. **Clarifies purpose** - Business Type vs Revenue Sources are distinct
4. **Builds trust** - Transparent about what changes affect
5. **Controls UI** - Determines tab visibility, alert categories, and wording

**Result:** "The platform understands what kind of business I actually run."
