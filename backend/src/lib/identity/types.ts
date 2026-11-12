// Owners and their Google identity links (#488, PACK NJS-02; docs/aryash
// rule 2, 07_LLD_Data_Model.mmd, 13_LLD_Storage_Layout.txt).
//
// An owner key is random and opaque, made once per Google account and never
// reused. An identity link maps HMAC(issuer, subject) to it, so the account,
// not its email, is the identity: a changed email finds the same owner, and
// two accounts never share one. Data is still keyed by email until the
// migration issue; for now this only records who is who.

export type OwnerStatus = "active" | "disabled";

/** users/{ownerKey}. `email` is profile, kept current; never identity. */
export interface Owner {
  ownerKey: string;
  status: OwnerStatus;
  email: string;
  hostedDomain: string;
  createdAt: string;
  lastLoginAt: string;
}

/** identity_links/{linkId}: one Google account → its owner. */
export interface IdentityLink {
  linkId: string;
  ownerKey: string;
  hmacKeyVersion: number;
  createdAt: string;
}

/** What a sign-in brings, besides the link: profile fields to keep current. */
export interface OwnerProfile {
  email: string;
  hostedDomain: string;
}

/** A link points at no owner: refuse rather than mint a second one. */
export class CorruptIdentityLinkError extends Error {
  constructor() {
    super("identity link points at a missing owner");
    this.name = "CorruptIdentityLinkError";
  }
}

export interface IdentityStore {
  /**
   * The owner `linkId` maps to, or, if none, a new owner `newOwnerKey` with
   * its link: both made in one step, so two first sign-ins at once still make
   * one owner, and a failure leaves neither. An existing owner's profile is
   * refreshed (email, last sign-in); its status is never changed here.
   * Throws CorruptIdentityLinkError when the link's owner is missing.
   */
  findOrCreate(linkId: string, hmacKeyVersion: number, profile: OwnerProfile, newOwnerKey: string): Promise<{ owner: Owner; created: boolean }>;
  get(ownerKey: string): Promise<Owner | null>;
  /** Trusted server-side only (no route): disabling is NJS-03's (#489). */
  setStatus(ownerKey: string, status: OwnerStatus): Promise<void>;
}
