import { registerSignup } from "./features/signup/server/register.mjs";
import { createRuntimeManifestConsumer } from "./runtime.mjs";

export function createSignupApp(manifest, services, options = {}) {
  return createRuntimeManifestConsumer({
    ...options,
    manifest,
    handlers: new Map([["signup.register", registerSignup]]),
    services,
  });
}
