type GenerationErrorViewProps = {
  message: string;
};

export function GenerationErrorView({ message }: GenerationErrorViewProps) {
  return (
    <div role="alert" style={{ padding: 12, border: "1px solid #7f1d1d", borderRadius: 10, background: "#450a0a", color: "#fecaca" }}>
      {message}
    </div>
  );
}
