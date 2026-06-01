import { Handle, Position } from "@xyflow/react";
import { KIND_META, type NodeKind } from "../analyzer";

interface CodeNodeData {
  label: string;
  kind: NodeKind;
  meta?: string;
  calls: number;
  calledBy: number;
  file?: string; // present in project mode
  filePath?: string;
  fileColor?: string;
}

export default function CodeNode({ data }: { data: CodeNodeData }) {
  const meta = KIND_META[data.kind];
  return (
    <div className="code-node" style={data.fileColor ? { borderLeft: `5px solid ${data.fileColor}` } : undefined}>
      <Handle type="target" position={Position.Left} className="cn-handle" />
      <span className="cn-dot" style={{ background: meta.color }} />
      <div className="cn-body">
        <div className="cn-kind">
          {meta.label}
          {data.file && (
            <span className="cn-file" title={data.filePath}>
              · {data.file}
            </span>
          )}
        </div>
        <div className="cn-label" title={data.label}>
          {data.label}
        </div>
      </div>
      <div className="cn-stats">
        {data.calledBy > 0 && <span className="cn-stat" title="eingehende Aufrufe">←{data.calledBy}</span>}
        {data.calls > 0 && <span className="cn-stat" title="ausgehende Aufrufe">{data.calls}→</span>}
      </div>
      <Handle type="source" position={Position.Right} className="cn-handle" />
    </div>
  );
}
