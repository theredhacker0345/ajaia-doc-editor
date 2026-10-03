import type { Editor } from "@tiptap/react";

/** Google-Docs-style formatting toolbar driven by TipTap chain commands. */

function Btn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? " active" : ""}`}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export default function Toolbar({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const off = disabled === true;

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="tb-group">
        <Btn title="Bold (Ctrl+B)" disabled={off || !editor?.can().toggleBold()} active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </Btn>
        <Btn title="Italic (Ctrl+I)" disabled={off || !editor?.can().toggleItalic()} active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </Btn>
        <Btn title="Underline (Ctrl+U)" disabled={off || !editor?.can().toggleUnderline()} active={editor?.isActive("underline")}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </Btn>
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        <Btn title="Heading 1" disabled={off || !editor?.can().toggleHeading({ level: 1 })} active={editor?.isActive("heading", { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </Btn>
        <Btn title="Heading 2" disabled={off || !editor?.can().toggleHeading({ level: 2 })} active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Btn>
        <Btn title="Heading 3" disabled={off || !editor?.can().toggleHeading({ level: 3 })} active={editor?.isActive("heading", { level: 3 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </Btn>
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        <Btn title="Bulleted list" disabled={off || !editor?.can().toggleBulletList()} active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          • List
        </Btn>
        <Btn title="Numbered list" disabled={off || !editor?.can().toggleOrderedList()} active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          1. List
        </Btn>
      </div>

      <span className="tb-sep" />

      <div className="tb-group">
        <Btn title="Undo (Ctrl+Z)" disabled={off || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}>
          ↺
        </Btn>
        <Btn title="Redo (Ctrl+Shift+Z)" disabled={off || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}>
          ↻
        </Btn>
      </div>
    </div>
  );
}
