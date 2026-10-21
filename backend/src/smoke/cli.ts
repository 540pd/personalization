// npm run smoke -- <backend-url> [--cookie <value>] [--email <address>]
//                                [--generate] [--infra-token <token>]
// One line per check; exits 1 if any failed (#336).

import { runSmoke, type CheckResult, type SmokeOptions } from "./smoke.js";

function parse(argv: string[]): SmokeOptions {
  const opts: SmokeOptions = { url: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--generate") opts.generate = true;
    else if (a === "--cookie") opts.cookie = argv[++i];
    else if (a === "--email") opts.email = argv[++i];
    else if (a === "--infra-token") opts.infraToken = argv[++i];
    else if (!a.startsWith("--") && !opts.url) opts.url = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!opts.url) throw new Error("Usage: npm run smoke -- <backend-url> [--cookie <value>] [--email <address>] [--generate] [--infra-token <token>]");
  return opts;
}

const MARK: Record<CheckResult["status"], string> = { pass: "✓", fail: "✗", skip: "–" };

try {
  const opts = parse(process.argv.slice(2));
  console.log(`Smoke test: ${opts.url}`);
  const results = await runSmoke(opts, (r) => console.log(`  ${MARK[r.status]} ${r.name.padEnd(13)} ${r.detail}`));
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(failed ? `${failed} failed` : "All checks passed.");
  process.exit(failed ? 1 : 0);
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}
