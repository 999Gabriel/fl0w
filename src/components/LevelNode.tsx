import { Handle, Position } from "@xyflow/react";

interface LevelNodeData {
  label: string;
  path: string;
  kind: "folder" | "file";
  weight: number;
  fanIn: number;
  fanOut: number;
  color: string;
}

export default function LevelNode({ data }: { data: LevelNodeData }) {
  const isFolder = data.kind === "folder";
  return (
    <div
      className={`level-node ${isFolder ? "is-folder" : "is-file"}`}
      style={{ borderLeft: `6px solid ${data.color}` }}
      title={data.path}
    >
      <Handle type="target" position={Position.Left} className="cn-handle" />
      <div className="ln-body">
        <div className="ln-kind">
          {isFolder ? "📁" : "📄"} {isFolder ? "FOLDER" : "FILE"}
        </div>
        <div className="ln-label" title={data.path}>
          {data.label}
        </div>
      </div>
      <div className="ln-stats">
        <span className="ln-weight">{data.weight}</span>
        <span className="ln-deg">
          {data.fanIn > 0 && <span title="incoming deps">←{data.fanIn}</span>}
          {data.fanOut > 0 && <span title="outgoing deps">{data.fanOut}→</span>}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="cn-handle" />
    </div>
  );
}
