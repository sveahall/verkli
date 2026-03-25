import BookEditorView from "./editor/BookEditorView";
import {
  type BookEditorProps,
  getInitialTool,
} from "./editor/bookEditor.shared";
import { BookWorkspaceCommandPaletteHost, BookWorkspaceCommandPaletteProvider } from "./editor/workspace/BookWorkspaceCommandPaletteProvider";
import { BookWorkspaceProvider } from "./editor/workspace/BookWorkspaceProvider";

export default function BookEditor(props: BookEditorProps) {
  const initialPanel = getInitialTool(props.visibleTools, props.initialTool);

  return (
    <BookWorkspaceProvider
      bookId={props.book.id}
      initialSelectedChapterId={props.chapters[0]?.id ?? null}
      initialActivePanel={initialPanel}
    >
      <BookWorkspaceCommandPaletteProvider>
        <BookEditorView {...props} />
        <BookWorkspaceCommandPaletteHost />
      </BookWorkspaceCommandPaletteProvider>
    </BookWorkspaceProvider>
  );
}
