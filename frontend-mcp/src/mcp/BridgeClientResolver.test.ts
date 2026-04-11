import assert from "node:assert/strict";
import test from "node:test";
import { createBridgeClientResolver } from "./BridgeClientResolver";

test("createBridgeClientResolver leaves chooser undefined when the client lacks elicitation support", async () => {
  let chooser: unknown;
  const resolver = createBridgeClientResolver(
    {
      selectSession: async (options: { chooseSession?: unknown }) => {
        chooser = options.chooseSession;
        return {
          session_id: "session-1",
          auth_token: "token-1",
          bridge_url: "http://127.0.0.1:8123/rpc",
        };
      },
    } as never,
    {
      server: {
        getClientCapabilities: () => ({}),
      },
    } as never,
  );

  await resolver({} as never);
  assert.equal(chooser, undefined);
});

test("createBridgeClientResolver enables chooser when the client supports elicitation", async () => {
  let chooser: unknown;
  const resolver = createBridgeClientResolver(
    {
      selectSession: async (options: { chooseSession?: unknown }) => {
        chooser = options.chooseSession;
        return {
          session_id: "session-1",
          auth_token: "token-1",
          bridge_url: "http://127.0.0.1:8123/rpc",
        };
      },
    } as never,
    {
      server: {
        getClientCapabilities: () => ({ elicitation: {} }),
      },
    } as never,
  );

  await resolver({} as never);
  assert.equal(typeof chooser, "function");
});
