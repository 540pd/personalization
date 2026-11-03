"use client";

// Luma reference: ASSET-01. The Assets page (#414): the product and brand
// assets generation works from, saved with the account (#412, #413).
// Design: the "Assets Page" canvas linked from the issue.
//
// This file only puts the page together (#462): the saved and edited
// versions are useAssetsDraft, adding files is useAssetUploads, and leaving
// with unsaved changes is useLeaveGuard.

import { useSection } from "@/store/section.store";
import { useToast } from "@/components/Toast/useToast";
import { deletePendingUploads } from "@/api/brandAssets.api";
import { imagesOf, isUploading, readiness, type AssetsDraft } from "../../assets/assetsDraft";
import { placeMaster } from "../../assets/placeMaster";
import type { LogoReading } from "../../assets/logoAnalysis";
import LibraryPage from "../Library/LibraryPage";
import { useLeaveGuard } from "../Library/useLeaveGuard";
import ProductSection from "./ProductSection";
import BrandSection from "./BrandSection";
import BrandColours from "./BrandColours";
import LogoGroup from "./LogoGroup";
import ReferencesSection from "./ReferencesSection";
import ReadinessStrip from "./ReadinessStrip";
import GuidelinesGroup from "./GuidelinesGroup";
import CreativeGroup from "./CreativeGroup";
import AssetsSaveBar from "./AssetsSaveBar";
import { useAssetsDraft } from "./useAssetsDraft";
import { useAssetUploads } from "./useAssetUploads";
import "./Assets.scss";

export default function AssetsPage() {
  const shown = useSection((s) => s.section === "assets");
  return shown ? <Page /> : null;
}

function Page() {
  const { load, draft, dirty, tried, saveState, problems, logoRequired, edit, reload, save, cancel } = useAssetsDraft();
  const uploads = useAssetUploads(draft, edit);
  // Discard clears the uploads no save attached, as Cancel does.
  const leaveConfirm = useLeaveGuard(dirty, { name: "the assets", onDiscard: () => void deletePendingUploads() });
  const [toast, showToast] = useToast();

  const onSave = async () => {
    if (await save()) showToast("Assets saved");
  };

  const onCancel = () => {
    cancel();
    uploads.reset();
  };

  return (
    <LibraryPage
      title="Assets"
      subtitle="Add the core product and brand assets Content Studio needs to generate accurate, on-brand creatives."
    >
      {load.kind === "loading" && (
        <p className="assets-status" role="status">
          Loading your assets…
        </p>
      )}
      {load.kind === "error" && (
        <div className="assets-alert" role="alert">
          {load.message}
          <button type="button" className="assets-link" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}
      {load.kind === "ready" && draft && (
        <>
          <ReadinessStrip items={readiness(draft, { logoRequired })} />
          {tried && !!problems?.message && (
            <div className="assets-alert" role="alert">
              {problems.message}
            </div>
          )}
          {saveState.kind === "conflict" && (
            <div className="assets-alert" role="alert">
              The Assets page was saved somewhere else since you opened it.
              <button type="button" className="assets-link" onClick={() => void reload()}>
                Load the latest
              </button>
            </div>
          )}
          <ProductSection
            draft={draft}
            onChange={edit}
            {...uploads.groupProps("productImage")}
            missingMaster={tried && !!problems?.missingMaster}
            missingName={tried && !!problems?.missingName}
            place={placeMaster(draft, dirty)}
          >
            <CreativeGroup kind="adaptFrom" draft={draft} onChange={edit} {...uploads.groupProps("adaptFrom")} />
          </ProductSection>
          <BrandSection>
            <LogoGroup
              draft={draft}
              onChange={edit}
              {...uploads.uploadProps("logo")}
              onReplace={(id, file) => void uploads.replace(id, file)}
              readings={uploads.readings}
              onRead={uploads.onRead}
              required={logoRequired}
              missing={tried && !!problems?.missingLogo}
            />
            <BrandColours
              colours={draft.colours}
              onChange={(key, value) => edit((d) => ({ ...d, colours: { ...d.colours, [key]: value } }))}
              suggestions={colourSuggestions(draft, uploads.readings)}
              flagged={tried ? (problems?.badColours ?? []) : []}
            />
            <GuidelinesGroup draft={draft} onChange={edit} {...uploads.uploadProps("guidelines")} />
            <CreativeGroup kind="styleExample" draft={draft} onChange={edit} {...uploads.groupProps("styleExample")} />
          </BrandSection>
          <ReferencesSection draft={draft} onChange={edit} {...uploads.groupProps("reference")} />

          <AssetsSaveBar
            dirty={dirty}
            saveState={saveState}
            uploading={isUploading(draft)}
            onSave={() => void onSave()}
            onCancel={onCancel}
          />
        </>
      )}

      {leaveConfirm}
      {toast}
    </LibraryPage>
  );
}

/** Colours suggested from the primary (first) logo's pixels (#417). */
function colourSuggestions(draft: AssetsDraft, readings: Record<string, LogoReading>) {
  const primaryLogo = imagesOf(draft, "logo")[0];
  return (primaryLogo && readings[primaryLogo.asset.id]?.colours) || [];
}
