// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GenerateForm, { type GenerateDraft } from "../GenerateForm";
import type { NodeKindSpec } from "../nodeKinds";
import type { Mentionables } from "../../../mentions/mentions";

// The @ menu in a panel's Instruction (#239), through GenerateForm as the
// panel uses it: the form owns no draft, so a harness holds one.

const spec: NodeKindSpec = {
  kind: "instruction",
  title: "Prompt",
  prompt: "What should this node work out?",
  mentions: "skills-and-agents",
  models: [
    { id: "lite", label: "Lite" },
    { id: "flash", label: "Flash" },
  ],
  defaultSettings: { temperature: 0 },
  sizeFor: () => ({ w: 320, h: 240 }),
  EmptyState: () => null,
  Output: () => null,
  generate: async () => ({ type: "text", value: "x" }),
};

const library: Mentionables = {
  skills: [
    { id: "s1", name: "brand-voice", description: "Warm, direct copy", tags: [], content: "Warm." },
    { id: "s2", name: "campaign-brief", description: "Key messages", tags: [], content: "Spring." },
  ],
  agents: [
    { id: "a1", name: "copywriter", description: "Taglines", tags: [], instructions: "Write.", model: "flash", skillIds: [] },
  ],
};

function Harness({ mentionables = library, kind = spec, initial = "" }: { mentionables?: Mentionables; kind?: NodeKindSpec; initial?: string }) {
  const [draft, setDraft] = useState<GenerateDraft>({ model: "lite", instruction: initial });
  return (
    <GenerateForm
      spec={kind}
      draft={draft}
      onDraftChange={setDraft}
      settings={kind.defaultSettings}
      onSettingsChange={vi.fn()}
      busy={false}
      error={null}
      onClose={vi.fn()}
      onInstructionBlur={vi.fn()}
      onSubmit={vi.fn()}
      mentionables={mentionables}
      onOpenLibrary={vi.fn()}
    />
  );
}

const box = () => screen.getByPlaceholderText("What should this node work out?") as HTMLTextAreaElement;
const type = (text: string) => {
  box().focus();
  fireEvent.change(box(), { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
};
const options = () => screen.queryAllByRole("option").map((o) => o.querySelector(".mention-menu-name")?.textContent);

describe("@ mentions in the Instruction (#239)", () => {
  it("@ after a space opens skills then agents; not inside a word", () => {
    render(<Harness />);
    type("write taglines @");
    expect(options()).toEqual(["brand-voice", "campaign-brief", "copywriter"]);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    type("mail a@b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("narrows as you type, and says when nothing matches", () => {
    render(<Harness />);
    type("@key");
    expect(options()).toEqual(["campaign-brief"]);
    type("@xyz");
    expect(screen.getByRole("listbox")).toHaveTextContent("No skills or agents match “xyz”");
  });

  it("Enter inserts the highlighted handle with a space; arrows move", () => {
    render(<Harness />);
    type("in @");
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(box().value).toBe("in @campaign-brief ");
  });

  it("Esc closes the menu and leaves the text", () => {
    render(<Harness />);
    type("@br");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box().value).toBe("@br");
  });

  it("picking an agent runs the panel on its model, said beside it", () => {
    render(<Harness />);
    type("@cop");
    fireEvent.click(screen.getByRole("option", { name: /copywriter/ }));
    expect(box().value).toBe("@copywriter ");
    expect(screen.getByText("· from @copywriter", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Flash/ })).toBeInTheDocument();
  });

  it("typing an agent's handle doesn't change the model", () => {
    render(<Harness />);
    type("@copywriter write");
    expect(screen.getByRole("button", { name: /^Lite/ })).toBeInTheDocument();
    expect(screen.queryByText(/from @copywriter/)).toBeNull();
  });

  it("notes unknown handles and a second agent; tints known ones", () => {
    const withPlanner: Mentionables = {
      ...library,
      agents: [...library.agents, { ...library.agents[0], id: "a2", name: "planner" }],
    };
    render(<Harness mentionables={withPlanner} initial="@copywriter @planner in @tone-guide and @brand-voice" />);
    expect(screen.getByText("@tone-guide isn't in your skills or agents, so it's sent as text.")).toBeInTheDocument();
    expect(screen.getByText("One agent per prompt: @planner is sent as text.")).toBeInTheDocument();
    expect([...document.querySelectorAll(".mention-known")].map((m) => m.textContent)).toEqual(["@copywriter", "@brand-voice"]);
  });

  it("an empty library says so, with links", () => {
    render(<Harness mentionables={{ skills: [], agents: [] }} />);
    type("@");
    expect(screen.getByRole("listbox")).toHaveTextContent("No skills or agents yet.");
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agents" })).toBeInTheDocument();
  });

  it("a kind without mentions keeps a plain textarea", () => {
    render(<Harness kind={{ ...spec, mentions: undefined }} />);
    type("@");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box()).not.toHaveAttribute("role");
  });
});

describe("the @ menu's id", () => {
  it("differs between two forms, so neither points at the other's menu", () => {
    render(<><Harness /><Harness /></>);
    const ids = screen.getAllByPlaceholderText("What should this node work out?").map((ta) => {
      (ta as HTMLTextAreaElement).focus();
      fireEvent.change(ta, { target: { value: "@", selectionStart: 1, selectionEnd: 1 } });
      return ta.getAttribute("aria-controls");
    });
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });
});
