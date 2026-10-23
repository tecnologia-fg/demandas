import assert from "node:assert/strict";
import path from "node:path";
import { STORAGE_DIR, storagePath } from "../../src/server/storage";

assert.equal(STORAGE_DIR, path.resolve(process.env.STORAGE_DIR?.trim() || "storage"));
assert.equal(storagePath("sample.pdf"), path.join(STORAGE_DIR, "sample.pdf"));
assert.throws(() => storagePath("../sample.pdf"));
console.log("Storage destination and filename validation passed.");
