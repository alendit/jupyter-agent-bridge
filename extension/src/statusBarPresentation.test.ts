import assert from "node:assert/strict";
import test from "node:test";
import { getBridgeStatusBarPresentation } from "./statusBarPresentation";

test("bridge status bar presentation does not override themed foreground colors", () => {
  assert.equal(getBridgeStatusBarPresentation(true).colorThemeKey, undefined);
  assert.equal(getBridgeStatusBarPresentation(false).colorThemeKey, undefined);
});
