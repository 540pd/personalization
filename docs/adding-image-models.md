# Adding or updating image generation models

## Overview

The model list shown in the **Create Image** panel (Node → Image) is defined in a single file. Adding, removing, or renaming a model requires editing that one file — no other frontend or backend file needs to change.

---

## Step 1 — Update the frontend model list

**File:** `frontend/src/components/canvas/NodePanel.tsx`
**Location:** top of the file, the `MODELS` constant (~line 12)

```typescript
const MODELS = [
  { id: "gemini-3.1-flash-image",      label: "Nano Banana 2" },
  { id: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite" },
  { id: "gemini-3-pro-image",          label: "Nano Banana Pro" },
  // Add new models here ↓
];
```

Each entry has two fields:

| Field   | Description |
|---------|-------------|
| `id`    | The Vertex AI model ID — sent verbatim as `modelId` in `POST /api/generate/image` |
| `label` | Display name shown in the picker dropdown |

**Example — adding a new model:**

```typescript
{ id: "gemini-3.2-flash-image", label: "Nano Banana 3" },
```

**Example — removing a model:**

Delete its line from the array. If it was the first entry, also update the default state below:

```typescript
// The default selected model is always MODELS[0].id — reorder the array
// to change which model is pre-selected when the panel first opens.
const [model, setModel] = useState(MODELS[0].id);
```

---

## Step 2 — Wire the model ID in the backend

**File:** `backend/src/routes/generate.ts` (or wherever image generation is handled)

The backend receives `modelId` from the request body. Add a case for the new model ID:

```typescript
// backend/src/routes/generate.ts
const MODEL_MAP: Record<string, string> = {
  "gemini-3.1-flash-image":      "gemini-3.1-flash-image",      // Nano Banana 2
  "gemini-3.1-flash-lite-image": "gemini-3.1-flash-lite-image", // Nano Banana 2 Lite
  "gemini-3-pro-image":          "gemini-3-pro-image",           // Nano Banana Pro
  // Add new model ID here ↓
};
```

The mapped value is passed to the Vertex AI SDK:

```typescript
const generativeModel = vertexAI.getGenerativeModel({ model: MODEL_MAP[modelId] });
```

If `VERTEX_PROJECT_ID` is absent (local dev without GCP), the route returns a placeholder — no crash. This is enforced by the mock-mode rule in `CLAUDE.md`.

---

## Step 3 — Verify

```bash
cd frontend && npx tsc --noEmit   # 0 errors
cd backend  && npx tsc --noEmit   # 0 errors
```

Smoke-test the picker in the browser:
1. Node → Image → Create Image panel opens
2. Click the model name below "Create Image" — dropdown shows updated list
3. Select the new model — label updates in the trigger
