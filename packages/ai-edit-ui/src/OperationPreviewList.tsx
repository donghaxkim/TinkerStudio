import type { AIEditOperation } from "@tinker/project-schema";

export type OperationPreviewListProps = {
  operations: AIEditOperation[];
};

function describeOperation(operation: AIEditOperation) {
  if (operation.type === "add_zoom") {
    return `Add zoom ${operation.start.toFixed(1)}s–${operation.end.toFixed(1)}s`;
  }

  if (operation.type === "add_callout") {
    return `Add callout “${operation.text}” ${operation.start.toFixed(1)}s–${operation.end.toFixed(1)}s`;
  }

  if (operation.type === "add_caption") {
    return `Add caption “${operation.text}” ${operation.start.toFixed(1)}s–${operation.end.toFixed(1)}s`;
  }

  return `Remove ${operation.entityType} ${operation.id}`;
}

export function OperationPreviewList({ operations }: OperationPreviewListProps) {
  if (operations.length === 0) {
    return <p style={{ margin: 0, color: "#94a3b8" }}>No operations proposed yet.</p>;
  }

  return (
    <ol style={{ display: "grid", gap: 8, margin: 0, paddingLeft: 20 }}>
      {operations.map((operation, index) => (
        <li key={`${operation.type}-${index}`}>
          <code style={{ color: "#93c5fd" }}>{operation.type}</code>
          <div>{describeOperation(operation)}</div>
        </li>
      ))}
    </ol>
  );
}
