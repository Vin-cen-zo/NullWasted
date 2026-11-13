# NullWasted Mobile PWA — Figma Design Blueprint & Design System Specifications

> **Document Type:** Coursework GUI Engineering Blueprint (Option B Deliverable)  
> **Target Framework:** Figma Auto-Layout (Version 2026 Engine) & Tokens Studio for Figma  
> **Canvas Standard:** iPhone 14 / 15 / 16 Baseline Canvas (`390px × 844px`), 4px/8px Soft-Grid  
> **Color Theme:** Dark Obsidian Mode (`#0F172A`) with High-Contrast Emerald Green (`#10B981`)  

---

## 1. Design Tokens & Visual Foundations

The NullWasted design system is engineered around a dark-mode-first aesthetic optimized for OLED displays, reducing battery consumption during late-night store closing operations while maximizing the visibility of food deal urgency indicators.

### 1.1 Color Palette Tokens

```
========================================================================================
TOKEN NAME           HEX VALUE    RGB / ALPHA             FIGMA ROLE & USAGE
========================================================================================
color.primary.500    #10B981      rgb(16, 185, 129)       Primary Brand CTA, Success states
color.primary.400    #34D399      rgb(52, 211, 153)       Interactive hover, Icon accents
color.primary.600    #059669      rgb(5, 150, 105)        Active / Pressed state
color.primary.glow   rgba(...)    rgba(16,185,129, 0.25)  Drop shadow glow for primary actions

color.bg.canvas      #0B0F19      rgb(11, 15, 25)         Base device canvas background
color.bg.viewport    #0F172A      rgb(15, 23, 42)         Standard screen viewport fill
color.surface.card   #1E293B      rgb(30, 41, 59)         Surface card, Sheet containers
color.surface.border #334155      rgb(51, 65, 85)         Subtle border strokes, Form outlines
color.surface.muted  #475569      rgb(71, 85, 105)        Inactive controls, Divider rules

color.text.primary   #F8FAFC      rgb(248, 250, 252)      Primary titles, High-contrast headings
color.text.secondary #CBD5E1      rgb(203, 213, 225)      Body paragraph text, Form values
color.text.muted     #94A3B8      rgb(148, 163, 184)      Captions, Helper text, Subtitles
color.text.disabled  #64748B      rgb(100, 116, 139)      Placeholder text, Inactive tabs

color.status.amber   #F59E0B      rgb(245, 158, 11)       Closing window urgency (< 45m left)
color.status.crimson #EF4444      rgb(239, 68, 68)        BPOM food safety reject, Expired items
========================================================================================
```

### 1.2 Typography Hierarchy Tokens

The type scale combines **Outfit** (modern geometric sans for authoritative branding and titles) with **Inter** (high-legibility neutral sans for body copy, form fields, and tabular numeric prices):

- **Display Title (Hero):** Font: *Outfit*, Weight: Bold (700), Size: `28px`, Line Height: `34px`, Tracking: `-0.02em`. Used for Welcome Hero and Order Success titles.
- **Section Heading (H1):** Font: *Outfit*, Weight: Semi-Bold (600), Size: `22px`, Line Height: `28px`, Tracking: `-0.01em`. Used for screen top app-bar headers.
- **Card Title (H2):** Font: *Outfit*, Weight: Semi-Bold (600), Size: `18px`, Line Height: `24px`. Used for food item names and store headers.
- **Subheading (H3):** Font: *Inter*, Weight: Semi-Bold (600), Size: `15px`, Line Height: `20px`. Used for section dividers and price tags.
- **Body Regular:** Font: *Inter*, Weight: Regular (400), Size: `14px`, Line Height: `20px`. Used for descriptions and card metadata.
- **Body Medium / Label:** Font: *Inter*, Weight: Medium (500), Size: `13px`, Line Height: `18px`. Used for button text and form field labels.
- **Caption / Badge:** Font: *Inter*, Weight: Semi-Bold (600), Size: `11px`, Line Height: `14px`, Tracking: `+0.04em` (Uppercase). Used for BPOM safety pills and closing countdown badges.

### 1.3 Spacing, Radii, and Elevation

- **8-Point Soft Grid:** All paddings, margins, and gaps must be multiples of 4px or 8px: `4px` (xxs), `8px` (xs), `12px` (sm), `16px` (md), `20px` (lg), `24px` (xl), `32px` (2xl).
- **Corner Radii:**
  - `radius.sm`: `8px` (Input fields, small badges, stepper buttons)
  - `radius.md`: `12px` (Standard buttons, filter tags)
  - `radius.lg`: `16px` (Feed cards, alert callouts)
  - `radius.xl`: `24px` (Bottom sheets, modal dialogs)
  - `radius.full`: `9999px` (Status pills, circular action triggers)
- **Drop Shadows / Elevation:**
  - `elevation.card`: `X: 0, Y: 4, Blur: 20, Spread: 0, Color: rgba(0, 0, 0, 0.45)`
  - `elevation.glow.emerald`: `X: 0, Y: 6, Blur: 24, Spread: 0, Color: rgba(16, 185, 129, 0.35)`
  - `elevation.glow.amber`: `X: 0, Y: 4, Blur: 16, Spread: 0, Color: rgba(245, 158, 11, 0.25)`

---

## 2. Core Reusable Component Library Recipes

### 2.1 Buttons (`Component: Button`)
- **Primary CTA Button:**
  - Auto-Layout: Horizontal, Width: `Fill container` (or Hug for inline), Height: `48px`, Padding: `12px 20px`, Alignment: Center.
  - Fill: `color.primary.500` (`#10B981`), Corner Radius: `12px`.
  - Effect: `elevation.glow.emerald`.
  - Label: Inter Semi-Bold `15px`, Fill: `#FFFFFF`.
- **Secondary Ghost / Border Button:**
  - Auto-Layout: Horizontal, Height: `48px`, Padding: `12px 20px`, Alignment: Center.
  - Fill: `color.surface.card` (`#1E293B`), Stroke: `1px solid #334155`, Corner Radius: `12px`.
  - Label: Inter Medium `14px`, Fill: `color.text.primary` (`#F8FAFC`).
- **Segmented Control Toggle (Dual Role Selector):**
  - Container Frame: Auto-Layout Horizontal, Height: `44px`, Padding: `4px`, Gap: `4px`, Fill: `#0F172A`, Stroke: `1px solid #334155`, Corner Radius: `10px`.
  - Active Tab: Auto-Layout Horizontal, Width: `Fill (1/2)`, Height: `36px`, Alignment: Center, Fill: `color.primary.500`, Corner Radius: `8px`, Label: Inter Semi-Bold `13px` `#FFFFFF`.
  - Inactive Tab: Auto-Layout Horizontal, Width: `Fill (1/2)`, Height: `36px`, Alignment: Center, Fill: `Transparent`, Corner Radius: `8px`, Label: Inter Medium `13px` `#94A3B8`.

### 2.2 Numerical Stepper (`Component: Stepper`)
- Container: Auto-Layout Horizontal, Height: `44px`, Gap: `8px`, Alignment: Center.
  - Decrement Button `[-]`: Fixed `40px × 40px`, Fill: `#1E293B`, Stroke: `1px solid #334155`, Corner Radius: `8px`, Icon/Text: `#CBD5E1`.
  - Value Display: Fixed `56px × 40px`, Alignment: Center, Label: Inter Bold `16px` `#F8FAFC` (`4`).
  - Increment Button `[+]`: Fixed `40px × 40px`, Fill: `#10B981`, Corner Radius: `8px`, Icon/Text: `#FFFFFF`.

### 2.3 Status Badges & Pills (`Component: Badge`)
- **BPOM Verified Pill:** Auto-Layout Horizontal, Padding: `4px 10px`, Gap: `6px`, Fill: `rgba(16, 185, 129, 0.15)`, Stroke: `1px solid rgba(16, 185, 129, 0.40)`, Corner Radius: `9999px`. Label: Inter Semi-Bold `11px` `#34D399` ("BPOM SAFE").
- **Closing Rush Tag:** Auto-Layout Horizontal, Padding: `4px 10px`, Gap: `6px`, Fill: `rgba(245, 158, 11, 0.15)`, Stroke: `1px solid rgba(245, 158, 11, 0.40)`, Corner Radius: `9999px`. Label: Inter Semi-Bold `11px` `#F59E0B` ("Closing in 42m").
- **Discount Percentage Badge:** Auto-Layout Horizontal, Padding: `3px 8px`, Fill: `rgba(16, 185, 129, 0.20)`, Corner Radius: `6px`. Label: Inter Bold `12px` `#10B981` ("60% OFF").

### 2.4 Bottom Navigation Bar (`Component: BottomNav`)
- Container: Auto-Layout Horizontal, Width: `390px`, Height: `76px`, Padding: `10px 24px 22px`, Fill: `#0B0F19`, Stroke Top: `1px solid #1E293B`, Alignment: Space-Between.
- Tab Items (4 items): Auto-Layout Vertical, Width: `Hug`, Gap: `4px`, Alignment: Center.
  - Active Tab: Icon `22px` `#10B981`, Label: Inter Semi-Bold `11px` `#10B981`.
  - Inactive Tab: Icon `22px` `#64748B`, Label: Inter Medium `11px` `#64748B`.

---

## 3. Screen-by-Screen Figma Auto-Layout Recipes

Below are the exact Auto-Layout construction recipes and layer trees for all 8 screens in Figma. Every screen is built inside a parent frame of `390px` width and `844px` height with `Clips content` enabled.

```
========================================================================================
TIER 1: ONBOARDING & ACCESS CONTROL (SCREENS 1 & 2)
========================================================================================
```

### Screen 1: Welcome Splash & Brand Onboarding (`Frame: Screen-1-Welcome`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `#0B0F19`, Layout: Auto-Layout Vertical, Padding: `48px 24px 40px`, Gap: `Auto` (Between), Alignment: Center.
- **Top Brand Section (`Frame: BrandHero`):**
  - Layout: Auto-Layout Vertical, Width: `Fill container`, Gap: `16px`, Alignment: Center.
  - Layer `AppLogoMark`: Vector / Frame `80 × 80`, Corner Radius: `24px`, Fill: Gradient (Emerald `#10B981` to Teal `#059669`), Glow effect `0 8px 30px rgba(16,185,129,0.4)`.
  - Layer `BrandTitle`: Text "NullWasted", Outfit ExtraBold `32px`, Fill: `#F8FAFC`.
  - Layer `BrandTagline`: Text "Rescue Surplus Food. Zero Waste.", Inter Regular `14px`, Fill: `#94A3B8`.
- **Value Proposition Carousel Card (`Frame: ValueCard`):**
  - Layout: Auto-Layout Vertical, Width: `Fill container`, Padding: `24px 20px`, Gap: `12px`, Fill: `#1E293B`, Stroke: `1px solid #334155`, Corner Radius: `20px`, Shadow: `elevation.card`.
  - Layer `Badge`: Auto-Layout Horizontal, Pill "AGENTIC AI ASSISTANT", Fill: `rgba(16,185,129,0.12)`, Text: `#34D399` `11px`.
  - Layer `CardHeading`: Text "Save up to 70% while stopping food waste", Outfit Semi-Bold `18px`, Fill: `#F8FAFC`.
  - Layer `CardSubtext`: Text "Connecting local bakeries and food merchants with hungry consumers right before closing time.", Inter Regular `13px`, Fill: `#CBD5E1`.
  - Layer `DotsIndicator`: Auto-Layout Horizontal, Gap: `6px`, 3 pills (Active: `24 × 6` `#10B981`, Inactive: `6 × 6` `#475569`).
- **Bottom Action Area (`Frame: ActionGroup`):**
  - Layout: Auto-Layout Vertical, Width: `Fill container`, Gap: `12px`, Alignment: Center.
  - Component `ButtonPrimary`: Label "Get Started", Width: `Fill container`.
  - Component `ButtonGhost`: Label "I already have an account", Width: `Fill container`.

---

### Screen 2: Dual-Role Authentication & Access Control (`Frame: Screen-2-Auth`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `#0F172A`, Layout: Auto-Layout Vertical, Padding: `54px 20px 32px`, Gap: `20px`, Alignment: Top.
- **Top App Bar (`Frame: TopBar`):**
  - Layout: Auto-Layout Horizontal, Width: `Fill container`, Alignment: Left.
  - Layer `BackIcon`: Frame `36 × 36`, Icon arrow-left `#CBD5E1`.
- **Heading Block (`Frame: TitleBlock`):**
  - Layout: Auto-Layout Vertical, Width: `Fill container`, Gap: `6px`.
  - Layer `Heading`: Text "Welcome Back", Outfit Bold `24px`, Fill: `#F8FAFC`.
  - Layer `Subheading`: Text "Choose your role to access customized features", Inter Regular `14px`, Fill: `#94A3B8`.
- **Role Segmented Switcher (`Frame: RoleSelector`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Height: `44px`, Padding: `4px`, Fill: `#0B0F19`, Stroke: `1px solid #334155`, Corner Radius: `10px`.
  - Tab 1 `StoreMerchant`: Width: `Fill (1/2)`, Height: `36px`, Alignment: Center, Fill: `color.primary.500`, Text: "Store Merchant" Inter Semi-Bold `13px` `#FFFFFF`.
  - Tab 2 `FoodRescuer`: Width: `Fill (1/2)`, Height: `36px`, Alignment: Center, Fill: `Transparent`, Text: "Food Rescuer" Inter Medium `13px` `#94A3B8`.
- **Form Input Group (`Frame: LoginForm`):**
  - Layout: Auto-Layout Vertical, Width: `Fill container`, Gap: `14px`.
  - Frame `InputEmail`: Auto-Layout Vertical, Gap: `6px`, Label: "Work Email or Phone" Inter Medium `12px` `#CBD5E1`, InputBox: Auto-Layout Horizontal, Height: `48px`, Padding: `0 14px`, Fill: `#1E293B`, Stroke: `1px solid #334155`, Corner Radius: `10px`, Text: "store@kenangan.co.id" Inter Regular `14px` `#F8FAFC`.
  - Frame `InputPassword`: Auto-Layout Vertical, Gap: `6px`, Label: "Password" Inter Medium `12px` `#CBD5E1`, InputBox: Auto-Layout Horizontal, Height: `48px`, Padding: `0 14px`, Fill: `#1E293B`, Stroke: `1px solid #334155`, Corner Radius: `10px`, Text: "••••••••••••" Inter Regular `14px` `#CBD5E1`.
  - Layer `ForgotLink`: Text "Forgot password?", Inter Medium `12px`, Fill: `#10B981`, Alignment: Right.
- **Action Buttons (`Frame: AuthActions`):**
  - Component `ButtonPrimary`: Label "Sign In as Merchant", Width: `Fill container`.
  - Frame `DividerGroup`: Auto-Layout Horizontal, Width: `Fill container`, Alignment: Center, Gap: `12px`, Line 1: `Fill` `#334155`, Text "OR" `11px` `#64748B`, Line 2: `Fill` `#334155`.
  - Component `ButtonGhost`: Auto-Layout Horizontal, Icon Google `18px`, Text "Continue with Google", Width: `Fill container`.

```
========================================================================================
TIER 2: MERCHANT OPERATIONS (SCREENS 3, 4, & 5)
========================================================================================
```

### Screen 3: Merchant Voice & AI Listing Hub (`Frame: Screen-3-VoiceHub`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `#0F172A`, Layout: Auto-Layout Vertical, Padding: `48px 20px 0`, Gap: `16px`, Alignment: Top.
- **Store Header Card (`Frame: StoreHeader`):**
  - Layout: Auto-Layout Horizontal, Width: `Fill container`, Padding: `16px`, Fill: `#1E293B`, Stroke: `1px solid #334155`, Corner Radius: `14px`, Alignment: Center, Gap: `12px`.
  - Frame `StoreAvatar`: `44 × 44`, Corner Radius: `10px`, Fill: `#334155`.
  - Frame `StoreMeta`: Auto-Layout Vertical, Width: `Fill container`, Gap: `4px`.
    - Text `StoreName`: "Kopi & Roti Kenangan", Outfit Semi-Bold `16px` `#F8FAFC`.
    - Pill `ClosingBadge`: "Closing at 21:00 WIB (45m left)", Inter Medium `11px` `#F59E0B`.
- **Metric Cards Row (`Frame: QuickMetrics`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Gap: `12px`.
  - Card 1 `ActiveStock`: Width: `Fill (1/2)`, Padding: `14px`, Fill: `#1E293B`, Corner Radius: `12px`, Text "Active Items: 4", Sub: "12 portions total" `12px` `#94A3B8`.
  - Card 2 `RescuedToday`: Width: `Fill (1/2)`, Padding: `14px`, Fill: `#1E293B`, Corner Radius: `12px`, Text "Rescued: 18 pcs", Sub: "Rp280.000 recovered" `12px` `#10B981`.
- **Central Voice Recording Hero (`Frame: VoiceRecorderHero`):**
  - Auto-Layout Vertical, Width: `Fill container`, Height: `280px`, Padding: `24px 16px`, Fill: `linear-gradient(180deg, #1E293B 0%, #0F172A 100%)`, Stroke: `1px solid #334155`, Corner Radius: `20px`, Alignment: Center, Gap: `16px`.
  - Layer `MicPulseOuter`: Frame `110 × 110`, Corner Radius: `9999px`, Fill: `rgba(16, 185, 129, 0.12)`, Alignment: Center.
  - Layer `MicPulseInner`: Frame `84 × 84`, Corner Radius: `9999px`, Fill: `rgba(16, 185, 129, 0.25)`, Alignment: Center.
  - Layer `MicButtonCore`: Frame `64 × 64`, Corner Radius: `9999px`, Fill: `#10B981`, Glow `0 6px 24px rgba(16,185,129,0.5)`, Alignment: Center, Icon: Microphone `28px` `#FFFFFF`.
  - Layer `WaveformVisualizer`: Auto-Layout Horizontal, Gap: `4px`, 16 bars varying height `10px` to `36px` `#34D399`.
  - Layer `VoiceInstruction`: Text "Tap to record voice listing or speak naturally", Inter Medium `13px` `#CBD5E1`.
- **Text Prompt Alternative Box (`Frame: TextPromptInput`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Height: `46px`, Padding: `0 14px`, Fill: `#1E293B`, Stroke: `1px solid #334155`, Corner Radius: `12px`, Alignment: Center, Gap: `8px`.
  - Text `Placeholder`: "Type: 'Ada 5 roti abon diskon 60%'...", Inter Regular `13px` `#64748B`.
  - Icon `SparklesAI`: `20px` `#10B981`.
- **Bottom Navigation (`Component: BottomNav`):** Pinned to bottom, Merchant Active Tab.

---

### Screen 4: 1-Tap AI Listing Confirmation Card (`Frame: Screen-4-PreviewCard`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `rgba(11, 15, 25, 0.85)` (Modal Backdrop Scrim), Layout: Auto-Layout Vertical, Padding: `0`, Alignment: Bottom.
- **Confirmation Sheet Modal (`Frame: ModalContainer`):**
  - Dimensions: `390 × 740`, Fill: `#0F172A`, Stroke Top: `1px solid #334155`, Corner Radius: `24px 24px 0 0`, Layout: Auto-Layout Vertical, Padding: `24px 20px 32px`, Gap: `16px`.
  - Top Drag Handle: Frame `40 × 4`, Fill: `#475569`, Corner Radius: `9999px`, Alignment: Center.
  - Header Row: Auto-Layout Horizontal, Width: `Fill container`, Space-Between, Title "Review AI Extracted Listing" Outfit Semi-Bold `18px`, Close Icon `20px` `#94A3B8`.
- **Extracted Food Item Card (`Frame: ItemReviewCard`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Padding: `14px`, Gap: `12px`, Fill: `#1E293B`, Stroke: `1px solid #334155`, Corner Radius: `14px`.
  - Image Thumbnail: Frame `64 × 64`, Corner Radius: `10px`, Image of Croissant pastry.
  - Meta: Auto-Layout Vertical, Width: `Fill container`, Gap: `4px`.
    - Text "Artisan Butter Croissant", Outfit Semi-Bold `16px` `#F8FAFC`.
    - Text "Category: Bakery & Pastry", Inter Regular `12px` `#94A3B8`.
- **Portion Stepper Control (`Frame: PortionStepperGroup`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Space-Between, Alignment: Center, Padding: `12px 16px`, Fill: `#1E293B`, Corner Radius: `12px`.
  - Label: "Available Quantity", Inter Medium `13px` `#CBD5E1`.
  - Component `Stepper`: `[-] 4 Portions [+]`.
- **Dynamic Pricing Engine Breakdown (`Frame: PricingCard`):**
  - Auto-Layout Vertical, Width: `Fill container`, Padding: `16px`, Gap: `8px`, Fill: `#1E293B`, Corner Radius: `14px`, Stroke: `1px solid #334155`.
  - Row 1: Original Price `Rp35.000` (Strikethrough `#94A3B8`), Space-Between.
  - Row 2: AI Dynamic Discount `60% OFF` (`#10B981` Semi-Bold), Space-Between.
  - Divider Line: `Fill` `#334155` `1px`.
  - Row 3: Final Rescue Price `Rp14.000 / portion`, Outfit Bold `20px` `#10B981`, Lock Icon `(Locked at publish)`.
- **BPOM Guardrail Verification Badge (`Frame: SafetyBadge`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Padding: `12px 14px`, Gap: `10px`, Fill: `rgba(16, 185, 129, 0.12)`, Stroke: `1px solid rgba(16, 185, 129, 0.35)`, Corner Radius: `12px`, Alignment: Center.
  - Icon Shield-Check: `20px` `#10B981`.
  - Text: "BPOM Safety Check Passed: Ambient shelf-life 2.5h remaining.", Inter Regular `12px` `#34D399`.
- **Action Buttons (`Frame: ModalActions`):**
  - Component `ButtonPrimary`: Label "Publish Listing Now (1-Tap)", Width: `Fill container`.
  - Component `ButtonGhost`: Label "Edit Extracted Parameters", Width: `Fill container`.

---

### Screen 5: Cashier Camera Handover Scanner (`Frame: Screen-5-Scanner`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `#05070C`, Layout: Auto-Layout Vertical, Padding: `50px 20px 32px`, Gap: `20px`, Alignment: Top.
- **Scanner Header (`Frame: ScannerBar`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Space-Between, Alignment: Center.
  - Icon Arrow-Left `24px` `#F8FAFC`.
  - Title "Pickup Verification Scanner", Outfit Semi-Bold `18px` `#F8FAFC`.
  - Icon Flashlight `24px` `#CBD5E1`.
- **Camera Viewfinder Area (`Frame: CameraViewport`):**
  - Dimensions: `350 × 360`, Fill: `#1E293B` (Simulated Camera feed), Corner Radius: `24px`, Overflow: Hidden, Alignment: Center.
  - Viewfinder Reticle: Frame `240 × 240`, 4 Corner Brackets (Emerald `#10B981`, Stroke `4px`, Length `32px`).
  - Animated Laser Beam: Horizontal Bar `220 × 2`, Gradient Neon Emerald, Glow `0 0 12px #10B981`.
  - Hint Text: "Align customer QR pass inside viewfinder", Inter Medium `12px` `#CBD5E1`, Background pill `#0B0F19`.
- **Real-Time Detection Card (`Frame: HandoverMatchCard`):**
  - Auto-Layout Vertical, Width: `Fill container`, Padding: `18px`, Gap: `12px`, Fill: `#1E293B`, Stroke: `1px solid #10B981`, Corner Radius: `16px`, Shadow: `elevation.glow.emerald`.
  - Header Row: Order Reference "Order #NW-8924", Status Pill "MATCH VERIFIED" (`#10B981`).
  - Item Row: "2x Artisan Butter Croissant", Sub: "Customer: Budi Santoso (Paid via QRIS)".
  - Component `ButtonPrimary`: Label "Confirm Handover & Release Order", Width: `Fill container`.

```
========================================================================================
TIER 3: CONSUMER DISCOVERY & HANDOVER (SCREENS 6, 7, & 8)
========================================================================================
```

### Screen 6: Consumer Surplus Food Discovery Feed (`Frame: Screen-6-Discovery`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `#0F172A`, Layout: Auto-Layout Vertical, Padding: `48px 0 0`, Gap: `16px`, Alignment: Top.
- **Top Location & Search Header (`Frame: LocationBar`):**
  - Auto-Layout Horizontal, Width: `350px` (Margin `20px`), Space-Between, Alignment: Center.
  - Frame `LocationPill`: Auto-Layout Horizontal, Gap: `6px`, Alignment: Center, Icon Pin `16px` `#10B981`, Text "Kukusan, Depok (Radius 2.5 km)", Outfit Semi-Bold `14px` `#F8FAFC`.
  - Icon Search `22px` `#CBD5E1`.
- **Category Filter Pills Row (`Frame: FilterScroll`):**
  - Auto-Layout Horizontal, Width: `Fill container`, Padding: `0 20px`, Gap: `8px`, Overflow: Horizontal Scroll.
  - Pill 1 (Active): Fill: `#10B981`, Text "All Deals (12)", Inter Semi-Bold `12px` `#FFFFFF`.
  - Pill 2: Fill: `#1E293B`, Stroke: `1px solid #334155`, Text "Bakery & Bread (5)", Inter Regular `12px` `#CBD5E1`.
  - Pill 3: Fill: `#1E293B`, Stroke: `1px solid #334155`, Text "Mystery Bag (3)", Inter Regular `12px` `#CBD5E1`.
  - Pill 4: Fill: `#1E293B`, Stroke: `1px solid #334155`, Text "Meals & Bento (4)", Inter Regular `12px` `#CBD5E1`.
- **Feed Listing Cards Container (`Frame: CardsFeed`):**
  - Auto-Layout Vertical, Width: `350px` (Margin `20px`), Gap: `14px`.
  - Card 1 `ItemDealCard`:
    - Layout: Auto-Layout Vertical, Width: `Fill container`, Padding: `14px`, Gap: `10px`, Fill: `#1E293B`, Corner Radius: `16px`, Stroke: `1px solid #334155`.
    - Hero Image: Height: `130px`, Corner Radius: `12px`, Croissant photo, Badges overlay: "60% OFF" and "Closing in 42m".
    - Store & Name: Text "Artisan Butter Croissant", Outfit Semi-Bold `16px` `#F8FAFC`, Sub "Kopi Kenangan (0.8 km)" `12px` `#94A3B8`.
    - Price & CTA Row: Price `Rp14.000` (was `Rp35.000`), Stock "4 left", Button "Reserve Now" (`#10B981` `36px`).
  - Card 2 `MysteryBagCard`:
    - Layout: Auto-Layout Vertical, Width: `Fill container`, Padding: `14px`, Gap: `10px`, Fill: `#1E293B`, Corner Radius: `16px`, Stroke: `1px solid #334155`.
    - Bag Graphic: Height: `130px`, Corner Radius: `12px`, Mystery box illustration, Badges: "70% OFF" and "Closing in 18m".
    - Info: "Surprise Bakery Mystery Bag", Outfit Semi-Bold `16px`, Price: `Rp25.000` (Valued at `Rp85.000`), Button "Reserve Now".
- **Bottom Navigation (`Component: BottomNav`):** Pinned to bottom, Consumer Active Tab.

---

### Screen 7: Product Detail & Reservation Checkout (`Frame: Screen-7-Detail`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `#0F172A`, Layout: Auto-Layout Vertical, Padding: `44px 0 0`, Gap: `14px`, Alignment: Top.
- **Top Navigation Bar (`Frame: DetailNavBar`):**
  - Auto-Layout Horizontal, Width: `350px` (Margin `20px`), Space-Between, Alignment: Center.
  - Icon Arrow-Left `24px` `#F8FAFC`, Title "Food Detail" Outfit Semi-Bold `17px`, Icon Bookmark `22px` `#CBD5E1`.
- **Food Hero Image Frame (`Frame: HeroBanner`):**
  - Dimensions: `390 × 200`, Image Croissant pastry, Gradient scrim bottom.
- **Detail Content Area (`Frame: DetailBody`):**
  - Auto-Layout Vertical, Width: `350px` (Margin `20px`), Gap: `14px`.
  - Item Title: "Artisan Butter Croissant Pastry Box", Outfit Bold `20px` `#F8FAFC`.
  - Merchant Info Box: Auto-Layout Horizontal, Padding: `12px`, Fill: `#1E293B`, Corner Radius: `12px`, Store "Kopi Kenangan (800m away, Jl. Margonda Raya)".
  - BPOM Safety Callout: Auto-Layout Horizontal, Padding: `12px`, Fill: `rgba(16, 185, 129, 0.12)`, Corner Radius: `12px`, Icon Shield, Text: "BPOM Safety Verified: Prepared fresh at 16:00 WIB, safe for consumption until 22:00 WIB." Inter Regular `12px` `#34D399`.
  - Pickup Window Pill: Auto-Layout Horizontal, Padding: `10px 14px`, Fill: `#1E293B`, Stroke: `1px solid #F59E0B`, Corner Radius: `10px`, Icon Clock, Text: "Self-Pickup Today: 20:30 - 21:30 WIB (Closing in 38m)" `#F59E0B`.
- **Bottom Checkout Bar (`Frame: BottomCheckoutDock`):**
  - Pinned to bottom, Auto-Layout Vertical, Width: `390px`, Padding: `16px 20px 24px`, Fill: `#0B0F19`, Stroke Top: `1px solid #1E293B`, Gap: `12px`.
  - Stepper & Price Row: Auto-Layout Horizontal, Space-Between, Alignment: Center, Stepper `[-] 1 [+]`, Total: `Rp14.000` (Original `Rp35.000`).
  - Component `ButtonPrimary`: Label "Reserve & Pay Now (Rp14.000)", Width: `Fill container`, Height: `50px`.

---

### Screen 8: Digital Pickup Pass & Dynamic QR Code (`Frame: Screen-8-Pass`)
- **Root Frame:** Dimensions: `390 × 844`, Fill: `#0F172A`, Layout: Auto-Layout Vertical, Padding: `50px 20px 32px`, Gap: `20px`, Alignment: Center.
- **Top Status Banner (`Frame: PassStatusBar`):**
  - Auto-Layout Horizontal, Padding: `6px 16px`, Fill: `rgba(16, 185, 129, 0.15)`, Stroke: `1px solid #10B981`, Corner Radius: `9999px`, Alignment: Center, Gap: `8px`.
  - Pulse Dot: Frame `8 × 8`, Fill: `#10B981`, Corner Radius: `9999px`.
  - Text: "ORDER READY FOR PICKUP", Inter Bold `12px` `#34D399`.
- **Order Metadata Card (`Frame: PassMetaCard`):**
  - Auto-Layout Vertical, Width: `Fill container`, Padding: `16px`, Fill: `#1E293B`, Corner Radius: `16px`, Gap: `4px`, Alignment: Center.
  - Text "Order #NW-8924", Inter Medium `13px` `#94A3B8`.
  - Text "Kopi & Roti Kenangan", Outfit Semi-Bold `18px` `#F8FAFC`.
  - Text "1x Artisan Butter Croissant (4 pcs)", Inter Regular `13px` `#CBD5E1`.
- **High-Contrast Digital QR Code Container (`Frame: QRCard`):**
  - Dimensions: `280 × 280`, Fill: `#FFFFFF`, Corner Radius: `20px`, Alignment: Center, Padding: `24px`, Shadow: `0 12px 36px rgba(0,0,0,0.6)`.
  - Layer `QRCodeMatrix`: Square SVG/Vector `200 × 200`, Fill: `#0F172A`.
  - Layer `PassPIN`: Text "PIN: NW-8924", Inter Bold `18px`, Fill: `#0F172A`, Letter Spacing: `2px`.
- **Dynamic Security Counter (`Frame: SecurityCounter`):**
  - Auto-Layout Horizontal, Gap: `6px`, Alignment: Center.
  - Icon Refresh `14px` `#F59E0B`.
  - Text: "Dynamic pass auto-refreshes in 14:32", Inter Medium `12px` `#F59E0B`.
- **Store Instructions & Navigation (`Frame: HandoverInstructions`):**
  - Text: "Show this digital pass to the store cashier upon arrival at the counter.", Inter Regular `12px` `#94A3B8`, Alignment: Center.
  - Component `ButtonPrimary`: Label "Open Directions (Google Maps)", Width: `Fill container`.
  - Component `ButtonGhost`: Label "Back to My Orders", Width: `Fill container`.

---

## 4. Figma Implementation & Tokens Studio Setup Guide

To load and use this specification inside Figma:

1. **Importing Design Tokens:**
   - Install the official **Tokens Studio for Figma** plugin from the Figma Community.
   - Open your project Figma file.
   - Click **Tools > Tokens Studio > Load Tokens > Local File / Paste JSON**.
   - Select the file [`tokens.json`](tokens.json).
   - Click **Apply to Selection / Create Local Styles & Variables**. All color palettes, font styles, and spacing grids will automatically generate in your Figma Variables panel.

2. **Auto-Layout Best Practices:**
   - Always use `Fill container` for horizontal widths of input fields, cards, and primary buttons so the UI remains 100% responsive across various mobile device widths (`375px`, `390px`, `412px`).
   - For vertical stacks, use `Hug contents` on parent cards and `Space-Between` on app bars and footer checkout docks.
   - Maintain the `4px/8px` grid by setting padding values strictly to `12px`, `16px`, `20px`, or `24px`.
