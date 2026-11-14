/**
 * Node BFF example. Use only from trusted Node Cloud Run code.
 * ownerKey must already have been resolved from an authenticated, revocable session.
 * The browser must never supply effective ownerKey or call FastAPI directly.
 * Dependency: npm install google-auth-library
 */
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();
const fastapiUrl = process.env.FASTAPI_URL!; // e.g. https://gcos-python-xxxxx.run.app

export async function createSkillFromBff(ownerKey: string) {
  // Recheck user entitlement and per-user ownership BEFORE constructing this call.
  const client = await auth.getIdTokenClient(fastapiUrl);
  const response = await client.request({
    url: `${fastapiUrl}/v1/skills`,
    method: 'POST',
    headers: { 'X-Owner-Key': ownerKey },
    data: {
      slug: 'brand-voice',
      display_name: 'Brand Voice',
      description: 'Applies approved brand voice to generated creative copy',
    },
  });
  return response.data;
}
