import { describe, expect, it } from "vitest";
import gsap from "gsap";
import { readCompositionTimeline } from "./compositionTimelineModel.js";

// Confirms the GSAP-introspection assumptions readCompositionTimeline relies on,
// against the real library. Timeline structure runs in jsdom (no rendering needed):
// we tween plain-object properties purely to give the child timelines a duration.
describe("readCompositionTimeline with a real GSAP timeline", () => {
  it("reads nested labeled scene timelines from a real gsap.timeline()", () => {
    const master = gsap.timeline({ paused: true });

    // paused: true on the children is exactly what makes the master's totalDuration()
    // return 0 before it ticks — the condition the robust derivation guards against.
    const hook = gsap.timeline({ id: "hook", paused: true });
    hook.to({ v: 0 }, { v: 1, duration: 2 });

    const feature = gsap.timeline({ id: "feature", paused: true });
    feature.to({ v: 0 }, { v: 1, duration: 3 });

    master.add(hook, 0);
    master.add(feature, 2);
    master.addLabel("cta", 5);

    const model = readCompositionTimeline(master);

    expect(model.durationSeconds).toBeCloseTo(5, 5);
    expect(model.clips.map((clip) => clip.id)).toEqual(["hook", "feature"]);
    expect(model.clips[0]).toMatchObject({ id: "hook", label: "hook" });
    expect(model.clips[0]!.start).toBeCloseTo(0, 5);
    expect(model.clips[0]!.end).toBeCloseTo(2, 5);
    expect(model.clips[1]!.start).toBeCloseTo(2, 5);
    expect(model.clips[1]!.end).toBeCloseTo(5, 5);
    expect(model.labels).toEqual([{ name: "cta", time: 5 }]);
  });

  it("does not extend duration past content for a trailing label", () => {
    const master = gsap.timeline({ paused: true });
    const hook = gsap.timeline({ id: "hook", paused: true });
    hook.to({ v: 0 }, { v: 1, duration: 2 });
    master.add(hook, 0);
    master.addLabel("promo", 10); // trailing marker — no content at t=10

    const model = readCompositionTimeline(master);

    expect(model.durationSeconds).toBeCloseTo(2, 5); // content ends at 2, NOT 10
    expect(model.labels).toEqual([{ name: "promo", time: 10 }]);
  });
});
