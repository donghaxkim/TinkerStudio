import { createHttpCompositionGenerationClient } from "./lib/httpCompositionGenerationClient.js";
import { createHttpCompositionEditClient } from "./lib/httpCompositionEditClient.js";
import { createHttpCompositionPlanningClient } from "./lib/httpCompositionPlanningClient.js";
import { createHttpCompositionImportClient } from "./lib/httpCompositionImportClient.js";
import { CompositionDemoScreen } from "./screens/CompositionEditor/CompositionDemoScreen.js";

// The composition flow runs against the real generation API (same-origin via the Vite
// /api proxy -> :4500). Edits POST /edits + poll. Import POSTs an existing bundle to
// /api/jobs/import and opens it in the editor.
const compositionClient = createHttpCompositionGenerationClient();
const compositionEditClient = createHttpCompositionEditClient();
const compositionPlanningClient = createHttpCompositionPlanningClient();
const compositionImportClient = createHttpCompositionImportClient();

export function App() {
  return (
    <CompositionDemoScreen
      client={compositionClient}
      planningClient={compositionPlanningClient}
      editClient={compositionEditClient}
      importClient={compositionImportClient}
    />
  );
}
