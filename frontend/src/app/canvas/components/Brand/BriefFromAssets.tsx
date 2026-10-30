"use client";

// What the Campaign Brief's Product and Logo rows show while they are on
// (#444): the product and logo as saved on the Assets page, or that there is
// none yet. They are chosen there, not here, so each links back to Assets.

import { briefLogo, briefProduct } from "../../assets/briefAssets";
import { toAssets, type SavedAssets } from "./useSavedAssets";

export function BriefProduct({ load }: { load: SavedAssets }) {
  if (load.state !== "ready") return <Pending load={load} />;
  const product = briefProduct(load.view);
  if (!product) return <Missing text="No product on the Assets page yet." />;
  return (
    <div className="brief-asset">
      <img className="brief-asset-thumb" src={product.image.url} alt="" />
      <span className="brief-asset-text">
        <span className="brief-asset-name">{product.name || product.image.name}</span>
        {product.sku && <span className="brief-muted">SKU {product.sku}</span>}
      </span>
      <ChangeLink />
    </div>
  );
}

export function BriefLogo({ load }: { load: SavedAssets }) {
  if (load.state !== "ready") return <Pending load={load} />;
  const logo = briefLogo(load.view);
  if (!logo) return <Missing text="No logo on the Assets page yet." />;
  return (
    <div className="brief-asset">
      {/* A logo is a transparent PNG: on a light chequer, so white parts still show. */}
      <span className="brief-asset-logo">
        <img src={logo.image.url} alt="" />
      </span>
      <span className="brief-asset-text">
        <span className="brief-asset-name">{logo.type}</span>
      </span>
      <ChangeLink />
    </div>
  );
}

function Pending({ load }: { load: SavedAssets }) {
  // The references group below carries the Retry: one reload for all three.
  return <span className="brief-muted">{load.state === "loading" ? "Loading…" : "Couldn't load it from Assets."}</span>;
}

/** Mandatory but not there: said in the amber Assets uses for "missing". */
function Missing({ text }: { text: string }) {
  return (
    <div className="brief-asset">
      <span className="brief-asset-missing">{text}</span>
      <button type="button" className="brief-link" onClick={toAssets}>
        Add it on the Assets page
      </button>
    </div>
  );
}

function ChangeLink() {
  return (
    <button type="button" className="brief-link" onClick={toAssets}>
      Change on the Assets page
    </button>
  );
}
