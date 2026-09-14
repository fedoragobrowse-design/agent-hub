import test from "node:test";
import assert from "node:assert/strict";
import { adapters } from "../src/index.ts";
test("ships each promised harness adapter", () => assert.deepEqual(Object.keys(adapters).sort(), ["claude-code", "codex", "omp", "opencode"]));
