# Brand Page – MVP Update & Campaign Brief Placement

## Purpose

Update the existing **Brand** page for the MVP by simplifying the current layout and adding a new **Campaign Brief** entry without changing the overall clean structure of the page.

The current Brand page already contains:

1. **Brand page title and description**
2. **Industry** field at the top
3. **Art-direction components** in a two-column grid
4. **Brand Profile** section at the bottom
5. **Save Brand** action at the bottom-right

For the MVP:
- **Industry – Keep**
- **Art Direction – Remove**
- **Brand Profile – Keep**
- **Campaign Brief – Add**

---

# 1. Existing Brand Page Structure

## Page Header

Keep the current page header exactly in the same location.

### Current placement
Top-left of the main content area.

### Content

**Brand**

Supporting text:

> What every generation knows about this client. Edits apply once you save.

This remains the overall Brand page introduction.

---

# 2. Brand Industry

**Status: Keep**

Keep the existing **Industry** field immediately below the Brand page header.

### Placement

The Industry field remains the **first field on the Brand page**, spanning the main content width.

### Field

**Industry**

- Type: Single-line text field
- Placeholder example: `e.g. Consumer electronics`

### Target layout

```text
Brand
What every generation knows about this client. Edits apply once you save.

Industry
[ e.g. Consumer electronics                                      ]
```

---

# 3. Art-direction Components

**Status: Remove**

Remove the entire existing **Art-direction components** section from the Brand page.

In the current screen, this section appears directly below Industry and is displayed as a **two-column grid of large cards**.

Remove all six existing cards:

- Colour palette
- Visual identity
- Product staging
- Lighting
- Environment / scene
- Campaign context

Also remove the following elements associated with these cards:

- Disabled checkbox
- Description text areas
- Reference image labels
- `+ Add image` controls

The heading **Art-direction components** should also be removed.

---

# 4. Campaign Brief

**Status: New Addition**

Add **Campaign Brief** to the Brand experience as a new campaign-specific input.

Campaign Brief should appear **after Industry and before Brand Profile**.

It should not recreate the previous large Art Direction grid.

Instead, use a simple compact section/card that acts as the entry point to the Campaign Brief.

---

## Campaign Brief – Placement on Brand Page

### Location

Place the Campaign Brief section:

**Below Industry**  
and  
**Above Brand Profile**

This uses the space previously occupied by the Art-direction components.

### Recommended page view

```text
Brand
What every generation knows about this client. Edits apply once you save.

Industry
[ e.g. Consumer electronics                                      ]


Campaign Brief
Define the campaign details that will guide creative generation.

[ Campaign Name ]    [ Objective ]
[ Product / Offer ]
[ Target Audience ]
[ Key Message ]

Mandatory Elements
Product  [toggle]
Logo     [toggle]
CTA      [toggle]
Legal    [toggle]

                                   [ Edit Campaign Brief ]


------------------------------------------------------------

Brand Profile

Brand homepage URL
[ https://example-brand.com                              ] [Analyze]

Coming soon


                                             [Cancel] [Save Brand]
```

---

# 5. Campaign Brief Interaction

The Brand page should show a **compact Campaign Brief summary**, not a large detailed form at all times.

When the marketer clicks:

**Campaign Brief**  
or  
**Edit Campaign Brief**

open the full Campaign Brief form in the **right-side panel**.

The marketer remains on the Brand page while editing the Campaign Brief.

---

# 6. Campaign Brief – Right-side Panel

## Panel Header

**Campaign Brief**

Supporting copy:

> Add the core campaign information that will guide creative generation in PlaySpace.

---

## Campaign Details

### Campaign Name

- Type: Single-line text field
- Example: `Urban Running 2026`

---

### Objective

- Type: Dropdown

Options:

- Awareness
- Consideration
- Engagement
- Conversion
- Retention

Example:

`Consideration`

---

### Product / Offer

- Type: Single-line text field
- Example: `Nike Running Shoe`

---

### Target Audience

- Type: Single-line or short text field
- Example: `Urban professionals, 25–35`

---

### Key Message

- Type: Single-line text field
- Example: `Performance and comfort for everyday city running`

---

# 7. Mandatory Elements

Add a separate subsection called:

**Mandatory Elements**

Use toggle buttons rather than free-text entry.

### Toggles

- Product
- Logo
- CTA
- Legal Copy

### Behaviour

**Toggle ON**
- The element becomes mandatory for the campaign.
- It must be retained or included when creative is generated.

**Toggle OFF**
- The element is not mandatory for the current campaign.

### Suggested layout

```text
Mandatory Elements

Product       [ ON  ]
Logo          [ ON  ]
CTA           [ ON  ]
Legal Copy    [ OFF ]
```

---

# 9. Brand Profile

**Status: Keep**

Keep the existing **Brand Profile** section at the bottom of the Brand page.

Its position remains **below Campaign Brief**.

### Existing elements to retain

**Brand homepage URL**

- Type: URL input field
- Example placeholder: `https://example-brand.com`

**Analyze**

- Keep the button to the right of the URL field.

**Coming soon**

- Retain the current supporting state/message if required for the MVP.

### Layout

```text
Brand Profile

Brand homepage URL
[ https://example-brand.com                              ] [ Analyze ]

Coming soon
```

---

# 10. Bottom Page Actions

Keep the current bottom action bar.

### Placement

At the bottom-right of the Brand page.

### Actions

- **Cancel**
- **Save Brand**

The existing visual hierarchy should remain:

- Cancel = secondary action
- Save Brand = primary action

---

# 11. Final Brand Page Structure

The updated page should follow this order:

```text
BRAND PAGE

1. Brand
   └── Page description

2. Industry
   └── Industry input

3. Campaign Brief
   ├── Campaign summary
   ├── Mandatory element summary
   └── Edit Campaign Brief
        └── Opens right-side panel

4. Brand Profile
   ├── Brand homepage URL
   └── Analyze

5. Bottom actions
   ├── Cancel
   └── Save Brand
```

---

# 12. Final Navigation / Information Architecture

```text
Brand
│
├── Industry
│
├── Campaign Brief
│   ├── Campaign Name
│   ├── Objective
│   ├── Product / Offer
│   ├── Target Audience
│   ├── Key Message
│   │
│   └── Mandatory Elements
│       ├── Product
│       ├── Logo
│       ├── CTA
│       └── Legal Copy
│
└── Brand Profile
    └── Brand Homepage URL
```

---

# 13. MVP Change Summary

| Existing Element | MVP Decision | Placement |
|---|---|---|
| Brand page header | Keep | Top of Brand page |
| Industry | Keep | Directly below header |
| Art-direction components | Remove | Removed completely |
| Colour palette | Remove | — |
| Visual identity | Remove | — |
| Product staging | Remove | — |
| Lighting | Remove | — |
| Environment / scene | Remove | — |
| Campaign context | Remove | — |
| Campaign Brief | **New** | Below Industry, above Brand Profile |
| Brand Profile | Keep | Bottom section |
| Cancel / Save Brand | Keep | Bottom-right action bar |

---