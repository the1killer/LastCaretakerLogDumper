import test from "node:test";
import assert from "node:assert/strict";
import { decodeArrayBuffer } from "../js/api/github.js";

test("decodeArrayBuffer handles diverse encodings and byte order marks", async (t) => {
  await t.test("decodes standard UTF-8 buffer without BOM", () => {
    const str = "Hello Last Caretaker";
    const buf = new TextEncoder().encode(str).buffer;
    assert.strictEqual(decodeArrayBuffer(buf), str);
  });

  await t.test("decodes UTF-8 buffer with BOM (0xEF, 0xBB, 0xBF)", () => {
    const payload = new TextEncoder().encode('{"key": "value"}');
    const bomPayload = new Uint8Array(3 + payload.length);
    bomPayload.set([0xef, 0xbb, 0xbf], 0);
    bomPayload.set(payload, 3);

    const result = decodeArrayBuffer(bomPayload.buffer);
    assert.strictEqual(result, '{"key": "value"}');
    assert.doesNotThrow(() => JSON.parse(result));
  });

  await t.test("decodes UTF-16 LE buffer with BOM (0xFF, 0xFE)", () => {
    const buf = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]).buffer;
    assert.strictEqual(decodeArrayBuffer(buf), "AB");
  });

  await t.test("decodes UTF-16 BE buffer with BOM (0xFE, 0xFF)", () => {
    const buf = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]).buffer;
    assert.strictEqual(decodeArrayBuffer(buf), "AB");
  });

  await t.test("decodes empty buffer cleanly", () => {
    assert.strictEqual(decodeArrayBuffer(new ArrayBuffer(0)), "");
  });
});
