# Assets Page – MVP UI/UX Specification

## Objective

The **Assets** page gives Content Studio the minimum product and brand information required to generate accurate, on-brand creatives.

For the MVP, keep the page focused on only two asset groups:

1. **Product / Master Creative**
2. **Brand Assets**

Avoid turning this page into a full Digital Asset Management system.

The page should answer two simple questions:

> **What product / creative are we working with?**

> **What brand elements must the generated creative follow?**

---

# 1. Page Header

## Title

**Assets**

## Supporting copy

> Add the core product and brand assets Content Studio needs to generate accurate, on-brand creatives.

## Optional project context

If a project has already been created, show the active project in the top-right:

```text
Project
[ Nike Running 2026 ▼ ]
```

This should be informational in the MVP and should not dominate the page.

---

# 2. Recommended Page Structure

```text
Assets

Add the core product and brand assets Content Studio needs
to generate accurate, on-brand creatives.


1. PRODUCT / MASTER CREATIVE                     Required
────────────────────────────────────────────────────────

Master Product Image
Product Name / SKU
Additional Product Images
Existing Master / Campaign Creative


2. BRAND ASSETS
────────────────────────────────────────────────────────

Logo
Typography
Brand Colours
Brand Guidelines
Approved Brand Examples


────────────────────────────────────────────────────────

                                      [ Cancel ] [ Save Assets ]
```

---

# 3. Product / Master Creative

## Purpose

Capture the main product or master creative Content Studio will use as the source for generation.

This is the most important section on the Assets page.

## Requirement

At least **one Master Product Image is mandatory** before the marketer can proceed.

---

## 3.1 Master Product Image

### Label

**Master Product Image**  
**Required**

### Supporting copy

> Upload the primary product image or hero creative that should be used as the source for generation.

### Upload control

```text
[ + Upload Product Image ]

Supported: PNG, JPG, JPEG
Recommended: high-resolution image
```

## Image details to capture after upload

After the user uploads the image, open a small metadata panel or inline form.

### Required image details

#### Asset Role
Type: Dropdown

Options:
- Master Product Image
- Hero Creative
- Packshot
- Product Reference

Default for the first uploaded image:
**Master Product Image**

#### Product Name
Type: Single-line text field

Example:

```text
Product Name
[ Nike Air Max 270 ]
```

### Optional image details

#### SKU / Product ID
Type: Single-line text field

#### Product Variant / Colourway
Type: Single-line text field

#### View / Angle
Type: Dropdown

Options:
- Front
- Side
- Back
- Top
- 3/4 Angle
- Close-up
- Other

#### Image Notes
Type: Short text field

Example:

```text
Image Notes
[ Use this image as the primary product reference. ]
```

---

## Master image behaviour

One uploaded product image should always be clearly identified as:

**Master**

Recommended visual treatment:

```text
[ Product thumbnail ]
MASTER
```

Only one image should be the primary Master Image at a time.

If the marketer selects another image as Master, the existing Master designation should move to the new image.

---

# 3.2 Additional Product Images

## Purpose

Allow the marketer to provide supporting product references so the tool better understands the product.

### Supporting copy

> Add additional product views to improve product fidelity during generation.

### Upload CTA

```text
[ + Add Product Image ]
```

### Recommended optional uploads

- Front view
- Side view
- Back view
- Top view
- Close-up
- Product detail
- Alternate colourway
- Alternate variant
- Clean packshot

## Details to ask for each additional image

For every uploaded product image, capture:

### Image Type
Dropdown:
- Product Angle
- Packshot
- Close-up / Detail
- Variant / Colourway
- Other

### View / Angle
Dropdown:
- Front
- Side
- Back
- Top
- 3/4 Angle
- Close-up
- Other

### Variant / Colourway
Short text field

### Optional Note
Short text field

---

# 3.3 Existing Master / Campaign Creative

## Status

Optional

## Purpose

Allow the marketer to upload an existing campaign creative if the new output is being adapted from a current or approved master.

### Supporting copy

> Add an existing hero creative or campaign master if Content Studio should adapt from an existing layout.

### CTA

```text
[ + Add Existing Creative ]
```

## Details to capture

### Creative Name
Single-line text field

### Creative Type
Dropdown:
- Hero Creative
- Campaign Key Visual
- Social Creative
- Display Creative
- Other

### Format / Aspect Ratio
Dropdown:
- 1:1
- 4:5
- 9:16
- 16:9
- Other

### Optional Note
Short text field

---

# 4. Product / Master Creative – Recommended Layout

```text
1  Product / Master Creative                         Required

Add the main product or hero creative that Content Studio
should use as the source for generation.


Master Product Image *

┌──────────────────────┐
│                      │
│   + Upload Image     │
│                      │
└──────────────────────┘

Product Name *
[ Nike Air Max 270                                      ]

SKU / Product ID
[ AM270-WHT-001                                         ]


Uploaded Product Images

┌────────────┐ ┌────────────┐ ┌────────────┐
│            │ │            │ │            │
│   Master   │ │ Side View  │ │ Close-up   │
│            │ │            │ │            │
└────────────┘ └────────────┘ └────────────┘

[ + Add Product Image ]


Existing Campaign / Master Creative                    Optional

[ + Add Existing Creative ]
```

---

# 5. Brand Assets

## Purpose

Capture the core brand assets required to keep generated creatives visually consistent and on-brand.

Keep this section practical.

For the MVP, include only:

1. Logo
2. Typography
3. Brand Colours
4. Brand Guidelines
5. Approved Brand Examples

---

# 5.1 Logo

## Purpose

Provide the logo that should be used in campaign creatives.

### Primary Logo

Recommended as required **only when branding is mandatory for the campaign**.

### Upload control

```text
Primary Logo
[ + Upload Logo ]
```

Supported:
- PNG
- SVG
- JPG

Prefer transparent PNG or SVG where available.

## Logo details to capture

### Logo Type
Dropdown:
- Primary Logo
- Secondary Logo
- Monochrome Logo
- Symbol / Icon
- Other

### Preferred Usage
Dropdown:
- Use by default
- Use on light backgrounds
- Use on dark backgrounds
- Reference only

### Optional Note
Short text field

---

## Alternate Logo

Optional.

```text
[ + Add Alternate Logo ]
```

Do not make multiple logo uploads mandatory for the MVP.

---

# 5.2 Typography

## Purpose

Tell Content Studio which fonts should be used in generated creative layouts.

### Primary Font

```text
Primary Font *
[ Helvetica Neue ▼ ]
```

Allow:
- selecting a known font
- entering a font name
- uploading a font file

### Font Upload

```text
[ + Upload Font File ]
```

Supported examples:
- OTF
- TTF
- WOFF / WOFF2 if supported

### Secondary Font

Optional.

```text
Secondary Font
[ Arial ]
```

## Typography details to capture

For MVP, ask only:

### Font Name
Text / dropdown

### Font Role
Dropdown:
- Primary
- Secondary
- Headline
- Body
- CTA

### Optional Usage Note
Short text field

Example:

```text
[ Use bold weight for headline; regular for supporting copy. ]
```


# 5.3 Brand Colours

## Purpose

Capture the core colour palette Content Studio should follow.

### Recommended MVP fields

#### Primary Colour

```text
Primary
[ ■ ]  #111111
```

#### Secondary Colour
Optional.

```text
Secondary
[ □ ]  #FFFFFF
```

#### Accent Colour
Optional.

```text
Accent
[ ■ ]  #FF5A3C
```

## Colour input behaviour

Allow either:
- visual colour picker
- HEX value input

For MVP, HEX is sufficient.

---

# 5.4 Brand Guidelines

## Status

Optional but strongly recommended.

## Purpose

Allow the marketer to provide existing brand rules rather than manually entering every rule in the tool.

### Upload CTA

```text
Brand Guidelines
[ + Upload Guidelines ]
```

Recommended file types:
- PDF
- DOCX
- PPTX if supported

## Details to capture

### Document Name
Auto-filled from filename, editable.

### Document Type
Dropdown:
- Brand Guidelines
- Visual Identity Guide
- Logo Guidelines
- Typography Guide
- Campaign Guideline
- Other

### Optional Note
Short text field

---

# 5.5 Approved Brand Examples

## Status

Optional

## Purpose

Provide examples of approved brand executions so Content Studio can understand how the brand is typically expressed.

This replaces the need for a separate **Approved Assets** section in the MVP.

### CTA

```text
[ + Add Approved Brand Example ]
```

## Examples

- Approved social post
- Approved campaign visual
- Approved product layout
- Approved typography treatment
- Approved logo placement

## Details to capture for each example

### Example Name
Single-line text field

### Example Type
Dropdown:
- Campaign Creative
- Product Creative
- Social Creative
- Layout Reference
- Typography Reference
- Logo Usage
- Other

### Optional Note
Short text field

---

# 6. Brand Assets – Recommended Layout

```text
2  Brand Assets

Add the brand identity elements Content Studio should use
to keep generated creatives consistent.


Logo

Primary Logo *
┌──────────────┐
│              │
│    LOGO      │
│              │
└──────────────┘

[ + Add Alternate Logo ]


Typography

Primary Font *
[ Helvetica Neue ▼ ]

Secondary Font
[ Optional ]

[ + Upload Font File ]


Brand Colours

Primary       Secondary       Accent
[ #111111 ]   [ #FFFFFF ]     [ #FF5A3C ]


Brand Guidelines

[ + Upload Guidelines ]

Uploaded:
Nike Brand Guidelines.pdf


Approved Brand Examples                            Optional

[ + Add Approved Brand Example ]

[ thumbnail ]  [ thumbnail ]  [ thumbnail ]
```

---

# 7. Final Recommended Assets Page Layout

```text
ASSETS

Add the core product and brand assets Content Studio needs
to generate accurate, on-brand creatives.


┌──────────────────────────────────────────────────────────────┐
│ 1. PRODUCT / MASTER CREATIVE                    REQUIRED    │
│                                                              │
│ Master Product Image *                                      │
│ [ Upload Image ]                                            │
│                                                              │
│ Product Name *                                              │
│ [_______________________________________________]            │
│                                                              │
│ SKU / Product ID                                            │
│ [_______________________________________________]            │
│                                                              │
│ Uploaded Images                                             │
│ [ Master ] [ Side ] [ Detail ] [ + Add Image ]             │
│                                                              │
│ Existing Campaign / Master Creative                         │
│ [ + Add Existing Creative ]                                 │
└──────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│ 2. BRAND ASSETS                                             │
│                                                              │
│ Logo                                                        │
│ [ Primary Logo ] [ + Alternate Logo ]                       │
│                                                              │
│ Typography                                                  │
│ Primary Font [_______________]                              │
│ Secondary Font [_____________]                              │
│ [ + Upload Font ]                                           │
│                                                              │
│ Brand Colours                                               │
│ [ Primary ] [ Secondary ] [ Accent ]                        │
│                                                              │
│ Brand Guidelines                                            │
│ [ + Upload Guidelines ]                                     │
│                                                              │
│ Approved Brand Examples                         OPTIONAL     │
│ [ + Add Example ]                                           │
└──────────────────────────────────────────────────────────────┘


────────────────────────────────────────────────────────────────

                                      [ Cancel ] [ Save Assets ]
```

---

# 8. Required vs Optional – MVP

| Field / Asset | MVP Requirement |
|---|---|
| Master Product Image | **Required** |
| Product Name | **Required** |
| SKU / Product ID | Optional |
| Additional Product Images | Optional |
| Existing Master Creative | Optional |
| Primary Logo | Required only when branding is mandatory |
| Alternate Logo | Optional |
| Primary Font | Recommended |
| Secondary Font | Optional |
| Font File | Optional |
| Primary Brand Colour | Recommended |
| Secondary / Accent Colours | Optional |
| Brand Guidelines | Optional but strongly recommended |
| Approved Brand Examples | Optional |

---

# 9. Upload Interaction Pattern

For image uploads, avoid asking the marketer for every detail before upload.

Recommended flow:

```text
1. User clicks Upload
        ↓
2. User selects file
        ↓
3. Thumbnail appears
        ↓
4. Small metadata panel opens
        ↓
5. User provides only relevant details
        ↓
6. Save
```

Example:

```text
Product Image

[ thumbnail ]

Asset Role
[ Product Angle ▼ ]

View
[ Side ▼ ]

Variant
[ White / Orange ]

Note
[ Preserve sole and side silhouette ]

                         [ Save ]
```

---

# 10. Empty States

## Product empty state

```text
No product image added yet.

Upload at least one product image to start generating creatives.

[ Upload Product Image ]
```

## Logo empty state

```text
No logo added.

Add your primary logo if branding is required for this campaign.

[ Upload Logo ]
```

## Brand Guidelines empty state

```text
No brand guidelines added.

Optional: Upload existing guidelines to improve brand consistency.

[ Upload Guidelines ]
```

---

# 11. Validation

## Before Save Assets

The system should validate:

- Master Product Image exists
- Product Name is entered

If branding is mandatory in the Campaign Brief:
- Primary Logo should exist

### Suggested validation message

> Add a Master Product Image and Product Name before saving.

If branding is mandatory:

> Add a Primary Logo because Logo is marked as mandatory in the Campaign Brief.

---

# 12. Interaction With Campaign Brief

The Assets page should complement, not duplicate, the Campaign Brief.

### Campaign Brief answers

- What is the campaign trying to achieve?
- Who is the audience?
- What is the key message?
- What elements are mandatory?

### Assets answers

- What product / creative are we working from?
- What visual brand elements should the tool use?

Example:

```text
Campaign Brief
Logo = Mandatory

           ↓

Assets
Primary Logo must be uploaded
```

---

# 13. Interaction With PlaySpace / Canvas

After Assets are saved, the selected assets become available in PlaySpace.

### Master Product Image
Automatically available as:
**Master Asset**


### Logo / Fonts / Colours
Available to:
**Brand Guard / Creative Planner / Generation workflow**

### Existing campaign creative
Available as:
**Creative Source / Reference**


---

# 14. MVP Design Principles

Use:
- clear section hierarchy
- large upload areas
- image thumbnails
- short supporting copy
- compact metadata
- minimal required fields

Avoid:
- large technical forms
- agent/model terminology
- workflow configuration
- advanced generation settings
- excessive mandatory fields

---

# 15. Final MVP Scope

The Assets page should include only:

## Product / Master Creative
- Master Product Image
- Product Name
- SKU / Product ID
- Additional Product Images
- Existing Master / Campaign Creative

## Brand Assets
- Primary / Alternate Logo
- Typography
- Brand Colours
- Brand Guidelines
- Approved Brand Examples

No separate Creative References or Approved Assets modules are required for the first MVP.

The goal is to collect **enough visual truth to generate correctly**, without asking the marketer to configure a full creative system before entering the canvas.
