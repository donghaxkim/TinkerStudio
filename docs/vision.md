# Vision

Build **Screen Studio for agents**: an AI system that can turn a software product into a polished demo video with minimal human recording, editing, or retakes.

## Problem

Creating good product demo videos is still painfully manual. A founder or team has to plan the storyline, prepare clean demo data, operate the product perfectly on camera, record the flow, redo mistakes, trim footage, add zooms/callouts/captions, and polish the final edit.

Even simple demos become time sinks. The Longcut recording process was a good example: getting one clean take required careful setup, repeated attempts, and a lot of manual editing.

## Product Idea

An agent should be able to produce screen-recording-style demo videos for software products — web apps first, eventually desktop apps too.

The agent should:

1. **Understand the product**
   - inspect the app
   - identify the core value proposition
   - decide what story the demo should tell
   - create or populate realistic fake demo data

2. **Operate and record the interface**
   - use browser/computer control to navigate the product
   - perform the demo flow reliably
   - capture the screen with cursor movement, clicks, typing, and UI state changes

3. **Edit the final video**
   - select the best flow
   - cut dead time and mistakes
   - add zooms, callouts, captions, transitions, voiceover, and brand styling
   - export a polished demo ready for a landing page, launch post, sales email, or investor update

## Core Belief

The hard part is not just screen recording. The hard part is turning a product into a clear, convincing story and executing that story cleanly on video.

The winning system should combine:

- product understanding
- demo planning
- deterministic interface control
- screen recording
- automated video editing

## Target Outcome

A user should be able to point the system at a product and say:

> “Make me a 60-second demo video showing why this product is useful.”

The system should return a polished first draft that is good enough to use or easy to refine, without requiring the user to manually perform perfect takes.

## Near-Term Focus

Start with web apps because browser automation is the most controllable environment.

The early product should prove that an agent can:

- understand a web app
- generate a coherent demo storyline
- create realistic demo state/data
- replay the flow reliably
- produce a clean screen-recording-style video

Desktop apps and deeper editing can come later.
