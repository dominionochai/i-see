import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusBox, pointInRect } from "../sceneMapping";

const rect = { left: 100, top: 50, width: 400, height: 200 };

describe("pointInRect", () => {
  it("maps points inside to fractions", () => {
    assert.deepEqual(pointInRect(300, 150, rect), { u: 0.5, v: 0.5 });
    assert.deepEqual(pointInRect(100, 50, rect), { u: 0, v: 0 });
  });
  it("rejects points outside and empty rects", () => {
    assert.equal(pointInRect(99, 150, rect), null);
    assert.equal(pointInRect(300, 251, rect), null);
    assert.equal(pointInRect(1, 1, { left: 0, top: 0, width: 0, height: 10 }), null);
  });
});

describe("focusBox", () => {
  it("is square in pixels for any aspect ratio", () => {
    for (const [aspect, w, h] of [[2, 1000, 500], [0.5, 500, 1000], [1, 800, 800]] as const) {
      const box = focusBox(0.5, 0.5, aspect);
      assert.ok(Math.abs(box.width * w - box.height * h) < 1e-6, `aspect ${aspect}`);
    }
  });
  it("stays inside the image near edges", () => {
    for (const [u, v] of [[0, 0], [1, 1], [0.02, 0.98], [0.5, 0.5]] as const) {
      const box = focusBox(u, v, 4 / 3);
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1 + 1e-9 && box.y + box.height <= 1 + 1e-9, `${u},${v}`);
    }
  });
  it("centres on the point when there is room", () => {
    const box = focusBox(0.5, 0.5, 1);
    assert.ok(Math.abs(box.x + box.width / 2 - 0.5) < 1e-9 && Math.abs(box.y + box.height / 2 - 0.5) < 1e-9);
  });
});
