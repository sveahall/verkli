"use client";

import { useEditorContext } from "./EditorContext";
import TypographyPanel from "./TypographyPanel";

const FOCUS_SHORTCUT = "f";

export default function authorEditorBar({
  onFocusToggle,
  onTypeauthorToggle,
  showToolbar,
  toolbarContent,
}: {
  onFocusToggle: () => void;
  onTypeauthorToggle: () => void;
  showToolbar: boolean;
  toolbarContent: React.ReactNode;
}) {
  const { focusMode, setFocusMode, typeauthorMode, setTypeauthorMode } =
    useEditorContext();

  const handleFocusClick = () => {
    const next = !focusMode;
    setFocusMode(next);
    onFocusToggle?.();
  };

  const handleTypeauthorClick = () => {
    const next = !typeauthorMode;
    setTypeauthorMode(next);
    onTypeauthorToggle?.();
  };

  return (
    <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
      <div className="flex items-center gap-1">{toolbarContent}</div>
      <div className="ml-auto flex items-center gap-1">
        <TypographyPanel />
        <ToolbarDivider />
        <ToolbarButton
          onClick={handleTypeauthorClick}
          active={typeauthorMode}
          title="Typeauthor mode"
        >
          Typeauthor
        </ToolbarButton>
        <ToolbarButton
          onClick={handleFocusClick}
          active={focusMode}
          title={`Focus mode (${FOCUS_SHORTCUT})`}
        >
          Focus
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded px-2 py-1 text-xs transition ${
        active
          ? "bg-slate-200 text-slate-900 dark:bg-white/20 dark:text-white"
          : "text-slate-600 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px bg-slate-200 dark:bg-white/10" />;
}
