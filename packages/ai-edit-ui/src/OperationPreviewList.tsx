import type { AIEditOperation } from "@tinker/project-schema";

export type OperationPreviewListProps = {
  operations: AIEditOperation[];
};

function describeOperation(operation: AIEditOperation) {
  if (operation.type === "add_zoom") {
    return `Add zoom ${operation.start.toFixed(1)}s–${operation.end.toFixed(1)}s`;
  }

  return `Remove ${operation.entityType} ${operation.id}`;
}

export function OperationPreviewList({ operations }: OperationPreviewListProps) {
  if (operations.length === 0) {
    return <p style={{ margin: 0, color: "var(--tk-text-ter)", fontSize: 12.5 }}>No operations proposed yet.</p>;
  }

  return (
    <ul style={{ display: "grid", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
      {operations.map((operation, index) => (
        <li
          key={`${operation.type}-${index}`}
          style={{
            display: "grid",
            gap: 3,
            padding: "8px 10px",
            border: "1px solid var(--tk-border)",
            borderRadius: "var(--tk-radius-sm)",
            background: "var(--tk-raised)",
          }}
        >
          <code
            style={{
              fontFamily: "var(--tk-mono)",
              fontSize: 10.5,
              letterSpacing: "0.02em",
              color: "var(--tk-accent)",
            }}
          >
            {operation.type}
          </code>
          <span style={{ fontSize: 12.5, color: "var(--tk-text)" }}>{describeOperation(operation)}</span>
        </li>
      ))}
    </ul>
  );
}
