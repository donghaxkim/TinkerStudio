import { createHttpCompositionGenerationClient } from "./lib/httpCompositionGenerationClient.js";
import { createHttpCompositionEditClient } from "./lib/httpCompositionEditClient.js";
import { CompositionDemoScreen } from "./screens/CompositionEditor/CompositionDemoScreen.js";

// The composition flow runs against the real generation API (same-origin via the Vite
// /api proxy -> :4500). Edits POST /edits + poll.
const compositionClient = createHttpCompositionGenerationClient();
const compositionEditClient = createHttpCompositionEditClient();

export function App() {
  return <CompositionDemoScreen client={compositionClient} editClient={compositionEditClient} />;
}
