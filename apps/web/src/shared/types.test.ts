import assert from "node:assert/strict";
import test from "node:test";
import { shouldLoadMarketplaceWorkflow, viewForAuthState } from "./types.js";

test("signed-in users are redirected away from account entry pages", () => {
  assert.equal(viewForAuthState("login", true), "market");
  assert.equal(viewForAuthState("signup", true), "market");
  assert.equal(viewForAuthState("forgot_password", true), "market");
});

test("account entry pages remain available to signed-out users", () => {
  assert.equal(viewForAuthState("login", false), "login");
  assert.equal(viewForAuthState("signup", false), "signup");
  assert.equal(viewForAuthState("forgot_password", false), "forgot_password");
});

test("authentication does not change other destinations", () => {
  assert.equal(viewForAuthState("profile", true), "profile");
  assert.equal(viewForAuthState("market", true), "market");
});

test("marketplace data loads for direct and impersonated market views", () => {
  assert.equal(shouldLoadMarketplaceWorkflow("market"), true);
  assert.equal(shouldLoadMarketplaceWorkflow("my_listings"), true);
  assert.equal(shouldLoadMarketplaceWorkflow("login"), false);
});
