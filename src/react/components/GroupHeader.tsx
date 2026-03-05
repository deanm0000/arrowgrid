import React from "react";

export interface GroupHeaderProps {
  groupKey: string;
  groupColumn: string;
  isCollapsed: boolean;
  rowCount: number;
  onToggle: (groupKey: string) => void;
}

export function GroupHeader({
  groupKey,
  groupColumn,
  isCollapsed,
  rowCount,
  onToggle,
}: GroupHeaderProps) {
  const handleClick = () => {
    onToggle(groupKey);
  };

  return (
    <div 
      className="group-header" 
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        padding: "4px 8px",
        userSelect: "none",
      }}
    >
      <span className="group-toggle" style={{ fontSize: "10px" }}>
        {isCollapsed ? "▶" : "▼"}
      </span>
      <span className="group-title" style={{ fontWeight: "bold" }}>
        {groupColumn}: {groupKey}
      </span>
      <span className="group-count" style={{ color: "#666" }}>
        ({rowCount} rows)
      </span>
    </div>
  );
}
