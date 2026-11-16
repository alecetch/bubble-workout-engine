import test from "node:test";
import assert from "node:assert/strict";
import { readAppVersionPolicy } from "../appVersionPolicy.js";
const read = env => { const warnings = []; return { policy: readAppVersionPolicy(env, { warn: value => warnings.push(value) }), warnings }; };
test("unset policy defaults and valid build integers", () => {
 const { policy } = read({});
 assert.deepEqual(policy.ios, { min_build: null, latest_build: null, update_url: null });
 assert.deepEqual(policy.android, { min_build: null, latest_build: null, update_url: "https://play.google.com/store/apps/details?id=fit.get200days.app" });
 assert.deepEqual(read({ MOBILE_MIN_BUILD_IOS: "14", MOBILE_LATEST_BUILD_IOS: "17" }).policy.ios, { min_build: 14, latest_build: 17, update_url: null });
});
test("invalid builds warn once with name and no value", () => {
 for (const value of ["abc", "-1", "1.5", "0", "", "01", "9007199254740992"]) {
  const { policy, warnings } = read({ MOBILE_MIN_BUILD_IOS: value });
  assert.equal(policy.ios.min_build, null);
  assert.deepEqual(warnings, [{ event: "app_config.invalid_build", variable: "MOBILE_MIN_BUILD_IOS" }]);
 }
});
test("URL validation accepts secure and beta links only", () => {
 assert.equal(read({ MOBILE_UPDATE_URL_IOS: "http://bad.test" }).policy.ios.update_url, null);
 assert.equal(read({ MOBILE_UPDATE_URL_IOS: "http://bad.test" }).warnings[0].event, "app_config.invalid_url");
 for (const url of ["https://testflight.apple.com/join/example", "itms-beta://test"]) assert.equal(read({ MOBILE_UPDATE_URL_IOS: url }).policy.ios.update_url, url);
});
test("minimum above latest warns without changing values", () => {
 const { policy, warnings } = read({ MOBILE_MIN_BUILD_IOS: "18", MOBILE_LATEST_BUILD_IOS: "17" });
 assert.equal(policy.ios.min_build, 18); assert.equal(policy.ios.latest_build, 17);
 assert.equal(warnings[0].event, "app_config.min_above_latest");
});
