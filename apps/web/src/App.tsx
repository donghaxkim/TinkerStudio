import { createHttpCompositionGenerationClient } from "./lib/httpCompositionGenerationClient.js";
import { createHttpCompositionEditClient } from "./lib/httpCompositionEditClient.js";
import { createHttpCompositionPlanningClient } from "./lib/httpCompositionPlanningClient.js";
import { CompositionDemoScreen } from "./screens/CompositionEditor/CompositionDemoScreen.js";

// The composition flow runs against the real generation API (same-origin via the Vite
// /api proxy -> :4500). Edits POST /edits + poll.
const compositionClient = createHttpCompositionGenerationClient();
const compositionEditClient = createHttpCompositionEditClient();
const compositionPlanningClient = createHttpCompositionPlanningClient();

export function App() {
  return (
    <CompositionDemoScreen
      client={compositionClient}
      planningClient={compositionPlanningClient}
      editClient={compositionEditClient}
    />
  );
}
