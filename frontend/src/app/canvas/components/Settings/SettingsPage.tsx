"use client";

// The Settings page (#214): the user's preferences in headed groups, drawn
// from the settings list (settings/settings.ts). Opened from the user menu
// or ⌘, rather than the rail -- it is not a place where work happens.
//
// No Save button: a change is in effect at once, and is kept in this browser.

import { useEffect } from "react";
import { Info } from "lucide-react";
import { useSection } from "@/store/section.store";
import { dialogIsOpen, isEditableTarget } from "@/lib/dom/keys";
import { useSettings } from "@/store/settings.store";
import { useToast } from "@/components/Toast/useToast";
import LibraryPage from "../Library/LibraryPage";
import { dockIcon } from "../FloatingDock/items";
import { GROUP_INFO, isDefault, settingGroups, type SettingSpec } from "../../settings/settings";
import "./Settings.scss";

/** ⌘, (Ctrl+, elsewhere): the usual key for an app's settings. */
function isSettingsKey(e: KeyboardEvent): boolean {
  return e.key === "," && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}


export default function SettingsPage() {
  const shown = useSection((s) => s.section === "settings");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing a comma with a modifier in a field is the field's business.
      if (!isSettingsKey(e) || isEditableTarget(e.target)) return;
      // Not from under a dialog, wherever focus is: switching pages would drop
      // what it holds, an Upload or Edit dialog's unsaved fields among them.
      if (dialogIsOpen()) return;
      e.preventDefault();
      useSection.getState().setSection("settings");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return shown ? <Page /> : null;
}

function Page() {
  const settings = useSettings((s) => s.settings);
  const [toast, showToast] = useToast();

  const change = (spec: SettingSpec, value: string | boolean) => {
    const ok = useSettings.getState().set(spec.id, value as never);
    if (!ok) showToast("Couldn't save the setting.", true);
  };

  const reset = () => {
    const ok = useSettings.getState().reset();
    showToast(ok ? "Settings reset to defaults" : "Couldn't save the setting.", !ok);
  };

  return (
    <LibraryPage
      closable
      title="Settings"
      subtitle="How the board looks and behaves. Changes apply right away and are kept in this browser."
    >
      {settingGroups().map(({ group, specs }) => {
        const groupId = `settings-group-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const info = GROUP_INFO[group] ?? {};
        const on = specs.filter((spec) => settings[spec.id] === true).length;
        return (
          <section
            key={group}
            className="settings-group"
            aria-labelledby={groupId}
            aria-describedby={info.help ? `${groupId}-help` : undefined}
          >
            <div className="settings-group-header">
              <h2 id={groupId} className="settings-group-title">
                {group}
              </h2>
              {info.count && (
                <span className="settings-group-count">
                  {on + info.count.always} of {specs.length + info.count.always} shown
                </span>
              )}
            </div>
            {info.help && (
              <p id={`${groupId}-help`} className="settings-group-help">
                {info.help}
              </p>
            )}
            <div className="settings-card">
              {info.allOffNotice && on === 0 && (
                <div role="status" className="settings-notice">
                  <Info size={16} aria-hidden />
                  {info.allOffNotice}
                </div>
              )}
              {specs.map((spec) => (
                <SettingRow key={spec.id} spec={spec} value={settings[spec.id]} onChange={(v) => change(spec, v)} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="settings-footer">
        <button
          type="button"
          className="settings-reset"
          onClick={reset}
          disabled={isDefault(settings)}
          title={isDefault(settings) ? "Everything is at its default" : undefined}
        >
          Reset to defaults
        </button>
      </div>
      {toast}
    </LibraryPage>
  );
}

function SettingRow({
  spec,
  value,
  onChange,
}: {
  spec: SettingSpec;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const labelId = `setting-${spec.id}-label`;
  const helpId = spec.help ? `setting-${spec.id}-help` : undefined;
  // A menu item's row (#404): the item's icon, no help, and greyed while hidden.
  const tool = spec.type === "toggle" ? spec.tool : undefined;
  const className = [
    "settings-row",
    spec.help ? "" : "is-compact",
    tool && value !== true ? "is-off" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={className} data-setting={spec.id}>
      {tool && (
        <span className="settings-row-icon" aria-hidden>
          {dockIcon(tool)}
        </span>
      )}
      <div className="settings-row-text">
        <div id={labelId} className="settings-row-label">
          {spec.label}
        </div>
        {spec.help && (
          <div id={helpId} className="settings-row-help">
            {spec.help}
          </div>
        )}
      </div>
      {spec.type === "choice" ? (
        // Native radios: Tab reaches the group, arrow keys move the choice.
        <fieldset className="settings-choice" aria-labelledby={labelId} aria-describedby={helpId}>
          {spec.options.map((option) => (
            <label
              key={option.value}
              className={value === option.value ? "settings-choice-option is-selected" : "settings-choice-option"}
            >
              <input
                type="radio"
                className="settings-choice-input"
                name={`setting-${spec.id}`}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              {spec.id === "linkStyle" && <LinkStyleIcon style={option.value} />}
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <button
          type="button"
          role="switch"
          className="settings-switch"
          aria-checked={value === true}
          aria-labelledby={labelId}
          aria-describedby={helpId}
          onClick={() => onChange(value !== true)}
        >
          <span className="settings-switch-thumb" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** The shape of each connection style, as the dock's Links menu draws it. */
function LinkStyleIcon({ style }: { style: string }) {
  const d =
    style === "link-straight" ? "M2 12 L 16 2" : style === "link-elbow" ? "M2 12 H 9 V 2 H 16" : "M2 12 C 8 12, 10 2, 16 2";
  return (
    <svg
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
