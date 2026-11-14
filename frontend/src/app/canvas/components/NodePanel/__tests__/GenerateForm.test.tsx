// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GenerateForm, { type GenerateDraft } from "../GenerateForm";
import type { ImageSettings, NodeKindSpec, SettingsProps } from "../nodeKinds";

// GenerateForm imports no store and no Konva, which is the point: it is the
// one piece of the panel reachable from a unit test.

const baseSpec: NodeKindSpec = {
  kind: "image",
  title: "Create Image",
  prompt: "Describe the image...",
  models: [
    { id: "model-a", label: "Model A" },
    { id: "model-b", label: "Model B" },
  ],
  defaultSettings: { aspectRatio: "16:9", quality: "1K", thinking: "Minimal", temperature: 0.5 },
  sizeFor: () => ({ w: 320, h: 180 }),
  EmptyState: () => <div>empty</div>,
  Output: ({ value }) => <div>{value}</div>,
  generate: async () => ({ type: "image", value: "x" }),
};

function setup(overrides: Partial<React.ComponentProps<typeof GenerateForm>> = {}) {
  const props = {
    spec: baseSpec,
    draft: { model: "model-a", instruction: "" } as GenerateDraft,
    onDraftChange: vi.fn(),
    settings: baseSpec.defaultSettings,
    onSettingsChange: vi.fn(),
    busy: false,
    error: null as string | null,
    onClose: vi.fn(),
    onInstructionBlur: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<GenerateForm {...props} />);
  return props;
}

// Queried by class, not by accessible name: while busy the label changes to
// "Creating…" and the spinner sits inside the button, and getByRole stops
// matching it. Marking the spinner aria-hidden did not restore the match, so
// the name computation is doing something I have not pinned down — the class
// is stable and the assertions below are about behaviour, not naming.
const createButton = () =>
  document.querySelector(".node-panel-create-button") as HTMLButtonElement;

describe("GenerateForm", () => {
  it("renders the spec's title, prompt and first model", () => {
    setup();
    expect(screen.getByText("Create Image")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Describe the image...")).toBeInTheDocument();
    expect(screen.getByText("Model A")).toBeInTheDocument();
  });

  it("is inert with an empty or whitespace-only instruction", () => {
    const { onSubmit } = setup({ draft: { model: "model-a", instruction: "   " } });
    expect(createButton()).toBeDisabled();
    fireEvent.click(createButton());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits once the instruction has content", () => {
    const { onSubmit } = setup({ draft: { model: "model-a", instruction: "a helmet" } });
    expect(createButton()).toBeEnabled();
    fireEvent.click(createButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("is inert while busy, so a second submit cannot be fired", () => {
    const { onSubmit } = setup({ draft: { model: "model-a", instruction: "a helmet" }, busy: true });
    expect(createButton()).toBeDisabled();
    fireEvent.click(createButton());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("surfaces an error passed from the parent", () => {
    setup({ error: "Generation failed. Please try again." });
    expect(screen.getByText("Generation failed. Please try again.")).toBeInTheDocument();
  });

  it("reports edits rather than holding them, so a panel close cannot lose them", () => {
    const { onDraftChange } = setup({ draft: { model: "model-a", instruction: "" } });
    fireEvent.change(screen.getByPlaceholderText("Describe the image..."), {
      target: { value: "a brass helmet" },
    });
    expect(onDraftChange).toHaveBeenCalledWith({ model: "model-a", instruction: "a brass helmet" });
  });

  it("renders no advanced section for a spec without one", () => {
    setup({ spec: { ...baseSpec, Advanced: undefined } });
    expect(screen.queryByText("Advanced settings")).not.toBeInTheDocument();
  });

  it("renders the spec's advanced section when it has one", () => {
    const Advanced = ({ value }: SettingsProps) => <div>temp {String((value as { temperature: number }).temperature)}</div>;
    setup({ spec: { ...baseSpec, Advanced } });
    fireEvent.click(screen.getByText("Advanced settings"));
    expect(screen.getByText("temp 0.5")).toBeInTheDocument();
  });

  it("passes settings changes straight through from the spec's controls", () => {
    const Options = ({ value, onChange }: SettingsProps) => (
      <button onClick={() => onChange({ ...(value as ImageSettings), aspectRatio: "1:1" })}>ratio</button>
    );
    const { onSettingsChange } = setup({ spec: { ...baseSpec, Options } });
    fireEvent.click(screen.getByText("ratio"));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ aspectRatio: "1:1" }));
  });

  it("selecting a model reports the new draft", () => {
    const { onDraftChange } = setup();
    fireEvent.click(screen.getByText("Model A"));      // open the picker
    fireEvent.click(screen.getByText("Model B"));
    expect(onDraftChange).toHaveBeenCalledWith({ model: "model-b", instruction: "" });
  });

  // Options vary by model: the panel used to show the same controls for all
  // of them, so Nano Banana Pro offered a Thinking setting it has no config
  // for and 2.1 offered a Temperature it does not set.
  describe("per-model capabilities", () => {
    const Advanced = ({ supports }: SettingsProps) => (
      <div>
        {supports.thinking && <span>thinking-control</span>}
        {supports.temperature && <span>temperature-control</span>}
      </div>
    );
    const capSpec: NodeKindSpec = {
      ...baseSpec,
      Advanced,
      models: [
        { id: "full", label: "Full", supports: { temperature: true, thinking: true } },
        { id: "no-think", label: "No Think", supports: { temperature: true, thinking: false } },
        { id: "no-temp", label: "No Temp", supports: { temperature: false, thinking: true } },
        { id: "neither", label: "Neither", supports: {} },
      ],
    };

    const open = (model: string) => {
      setup({ spec: capSpec, draft: { model, instruction: "x" } });
      const adv = screen.queryByText("Advanced settings");
      if (adv) fireEvent.click(adv);
    };

    it("shows both controls for a model that takes both", () => {
      open("full");
      expect(screen.getByText("thinking-control")).toBeInTheDocument();
      expect(screen.getByText("temperature-control")).toBeInTheDocument();
    });

    it("hides Thinking for a model with no thinking config", () => {
      open("no-think");
      expect(screen.queryByText("thinking-control")).not.toBeInTheDocument();
      expect(screen.getByText("temperature-control")).toBeInTheDocument();
    });

    it("hides Temperature for a model that does not set one", () => {
      open("no-temp");
      expect(screen.getByText("thinking-control")).toBeInTheDocument();
      expect(screen.queryByText("temperature-control")).not.toBeInTheDocument();
    });

    it("hides the Advanced section entirely when nothing in it applies", () => {
      // An empty collapsible box is worse than no box.
      open("neither");
      expect(screen.queryByText("Advanced settings")).not.toBeInTheDocument();
    });

    it("treats a model with no declared capabilities as supporting everything", () => {
      setup({ spec: { ...baseSpec, Advanced }, draft: { model: "model-a", instruction: "x" } });
      fireEvent.click(screen.getByText("Advanced settings"));
      expect(screen.getByText("thinking-control")).toBeInTheDocument();
      expect(screen.getByText("temperature-control")).toBeInTheDocument();
    });
  });
});
