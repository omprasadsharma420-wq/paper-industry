import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_STATUSES,
  FLOW_STAGE,
  FLOW_STEPS,
  STATUS_ORDER,
  orderControl,
  words,
} from "../src/lib/agra-rules.ts";

test("enum labels are readable", () => {
  assert.equal(words("AWAITING_QC"), "Awaiting Qc");
  assert.equal(words("READY_FOR_HANDOVER"), "Ready For Handover");
});

test("every active order status has a task owner", () => {
  for (const status of ACTIVE_STATUSES) {
    const control = orderControl(status);
    assert.ok(control.task);
    assert.ok(control.owner);
  }
});

test("visible status filters follow operational order", () => {
  assert.equal(STATUS_ORDER[0], "DRAFT");
  assert.equal(STATUS_ORDER.at(-1), "DISPATCHED");
  assert.ok(STATUS_ORDER.indexOf("AWAITING_QC") < STATUS_ORDER.indexOf("PACKING"));
});

test("timeline stages advance without skipping the final state", () => {
  assert.equal(FLOW_STAGE.DRAFT, 0);
  assert.equal(FLOW_STAGE.AWAITING_APPROVAL, 2);
  assert.equal(FLOW_STAGE.REWORK_REQUIRED, 4);
  assert.equal(FLOW_STAGE.READY_FOR_HANDOVER, 6);
  assert.equal(FLOW_STAGE.DISPATCHED, FLOW_STEPS.length - 1);
});

test("completed and blocked orders show the correct owner", () => {
  assert.equal(orderControl("DISPATCHED").owner, "Complete");
  assert.equal(orderControl("BLOCKED").owner, "Operations Supervisor");
});
