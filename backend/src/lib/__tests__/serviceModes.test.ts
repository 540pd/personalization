import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDeployable, describeServiceModes, type ServiceModes } from "../serviceModes.js";

// Which services are real, and refusing placeholders when deployed (#333).

afterEach(() => vi.unstubAllEnvs());

const placeholders: ServiceModes = { auth: "anonymous", storage: { firestore: "local", storage: "local" }, ai: "placeholder", jobs: "in-process", supportEmail: "placeholder", fastapi: "placeholder" };
const gcp: ServiceModes = { auth: "required", storage: { firestore: "gcp", storage: "gcp" }, ai: "vertex", jobs: "cloud-tasks", supportEmail: "smtp", fastapi: "service" };

describe("describeServiceModes", () => {
  it("names each placeholder and the variables that switch it", () => {
    vi.stubEnv("LOCAL_DATA_DIR", "/tmp/gcos-data");
    const text = describeServiceModes(placeholders);
    expect(text).toContain("sign-in: anonymous (placeholder; AUTH_MODE=dev for dev sign-in) -- to switch: GOOGLE_OAUTH_CLIENT_ID, SESSION_SECRET");
    expect(text).toContain("local disk at /tmp/gcos-data (placeholder) -- to switch: FIRESTORE_PROJECT_ID, GCS_BUCKET_NAME");
    expect(text).toContain("AI:      offline placeholders -- to switch: VERTEX_PROJECT_ID");
    expect(text).toContain("jobs:    in process (placeholder) -- to switch: CLOUD_TASKS_QUEUE, CLOUD_TASKS_SERVICE_ACCOUNT, JOBS_WORKER_URL");
    expect(text).toContain("support: kept and logged, not emailed (placeholder) -- to switch: SUPPORT_EMAIL_TO, SUPPORT_EMAIL_FROM, SMTP_HOST");
    expect(text).toContain("FastAPI: in memory (placeholder) -- to switch: FASTAPI_BASE_URL");
    expect(text).toContain("docs/switching-to-gcp.md");
  });

  it("says nothing about switching once every service is real", () => {
    expect(describeServiceModes(gcp)).not.toContain("to switch");
  });
});

describe("assertDeployable", () => {
  it("lets local dev run on placeholders", () => {
    vi.stubEnv("K_SERVICE", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertDeployable(placeholders)).not.toThrow();
  });

  it("refuses a deployed backend on local disk or memory", () => {
    vi.stubEnv("K_SERVICE", "gcos-backend");
    expect(() => assertDeployable(placeholders)).toThrow(/storage is not GCP \(Firestore: local, Storage: local\)/);
    expect(() => assertDeployable({ ...gcp, storage: { firestore: "gcp", storage: "memory" } })).toThrow(/Storage: memory/);
  });

  it("refuses a deployed backend whose video jobs would run in process", () => {
    vi.stubEnv("K_SERVICE", "gcos-backend");
    expect(() => assertDeployable({ ...gcp, jobs: "in-process" })).toThrow(/video jobs would run in process/);
  });

  it("starts a deployed backend on GCP, warning about placeholder AI", () => {
    vi.stubEnv("K_SERVICE", "gcos-backend");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertDeployable(gcp)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    assertDeployable({ ...gcp, ai: "placeholder" });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/VERTEX_PROJECT_ID/));
  });

  it("starts a deployed backend without support email, warning that messages are only kept", () => {
    vi.stubEnv("K_SERVICE", "gcos-backend");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertDeployable({ ...gcp, supportEmail: "placeholder" })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/SUPPORT_EMAIL_TO/));
  });
});
