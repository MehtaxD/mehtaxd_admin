"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";

type DialogKind = "link" | "image" | null;

interface BlogEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

function safeUrl(value: string, kind: Exclude<DialogKind, null>) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const schemes =
      kind === "image" ? ["http:", "https:"] : ["http:", "https:", "mailto:"];
    return schemes.includes(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`blogEditorTool${active ? " active" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  openDialog,
}: {
  editor: Editor;
  openDialog: (kind: Exclude<DialogKind, null>) => void;
}) {
  const heading = editor.isActive("heading", { level: 2 })
    ? "2"
    : editor.isActive("heading", { level: 3 })
      ? "3"
      : editor.isActive("heading", { level: 4 })
        ? "4"
        : "0";

  return (
    <div
      className="blogEditorToolbar"
      role="toolbar"
      aria-label="Article formatting"
    >
      <label className="blogEditorFormat">
        <span className="srOnly">Text format</span>
        <select
          value={heading}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level === 0) editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .setHeading({ level: level as 2 | 3 | 4 })
                .run();
          }}
        >
          <option value="0">Paragraph</option>
          <option value="2">H2</option>
          <option value="3">H3</option>
          <option value="4">H4</option>
        </select>
      </label>
      <span className="blogToolDivider" />
      <ToolButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolButton>
      <ToolButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolButton>
      <ToolButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolButton>
      <span className="blogToolDivider" />
      <ToolButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •≡
      </ToolButton>
      <ToolButton
        label="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1≡
      </ToolButton>
      <ToolButton
        label="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        “
      </ToolButton>
      <ToolButton
        label="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        —
      </ToolButton>
      <span className="blogToolDivider" />
      <ToolButton
        label="Add link"
        active={editor.isActive("link")}
        onClick={() => openDialog("link")}
      >
        ↗
      </ToolButton>
      <ToolButton label="Add image" onClick={() => openDialog("image")}>
        ▧
      </ToolButton>
      <span className="blogToolDivider" />
      <ToolButton
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↶
      </ToolButton>
      <ToolButton
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↷
      </ToolButton>
    </div>
  );
}

export function BlogEditor({
  value,
  onChange,
  placeholder = "Start writing your article…",
  ariaLabel = "Article content",
}: BlogEditorProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [newTab, setNewTab] = useState(false);
  const [error, setError] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
      }),
      ImageExtension.configure({ allowBase64: false }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "blogEditorContent", "aria-label": ariaLabel },
    },
    onUpdate: ({ editor: activeEditor }) => onChange(activeEditor.getHTML()),
  });

  useEffect(() => {
    if (!editor || editor.isFocused || editor.getHTML() === value) return;
    editor.commands.setContent(value || "");
  }, [editor, value]);

  function openDialog(kind: Exclude<DialogKind, null>) {
    setDialog(kind);
    setError("");
    setAlt("");
    if (kind === "link" && editor) {
      setUrl(String(editor.getAttributes("link").href ?? ""));
      setNewTab(editor.getAttributes("link").target === "_blank");
    } else {
      setUrl("");
      setNewTab(false);
    }
  }

  function closeDialog() {
    setDialog(null);
    setError("");
  }

  function applyDialog(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || !dialog) return;
    const validated = safeUrl(url, dialog);
    if (!validated) {
      setError(
        dialog === "image"
          ? "Use an HTTPS image URL or a server-relative media path."
          : "Use a safe HTTP, HTTPS, mailto, or internal URL.",
      );
      return;
    }
    if (dialog === "link") {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({
          href: validated,
          target: newTab ? "_blank" : null,
          rel: newTab ? "noopener noreferrer" : null,
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .setImage({ src: validated, alt: alt.trim() })
        .run();
    }
    closeDialog();
  }

  if (!editor) return <div className="blogEditorLoading">Loading editor…</div>;

  return (
    <div className="blogEditor">
      <EditorToolbar editor={editor} openDialog={openDialog} />
      <EditorContent editor={editor} />
      {dialog && (
        <div
          className="blogModalBackdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDialog();
          }}
        >
          <form
            className="blogModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="blog-dialog-title"
            onSubmit={applyDialog}
          >
            <div className="blogModalHead">
              <div>
                <span>CONTENT MEDIA</span>
                <h2 id="blog-dialog-title">
                  {dialog === "link" ? "Add a link" : "Insert an image"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={closeDialog}
              >
                ×
              </button>
            </div>
            <label className="adminField">
              <span>{dialog === "link" ? "URL" : "Image URL"}</span>
              <input
                autoFocus
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={
                  dialog === "link"
                    ? "https://example.com"
                    : "https://cdn.example.com/image.webp"
                }
              />
            </label>
            {dialog === "image" ? (
              <label className="adminField">
                <span>Alt text</span>
                <input
                  value={alt}
                  onChange={(event) => setAlt(event.target.value)}
                  placeholder="Describe the image for accessibility"
                />
              </label>
            ) : (
              <label className="blogCheck">
                <input
                  type="checkbox"
                  checked={newTab}
                  onChange={(event) => setNewTab(event.target.checked)}
                />
                <span>Open in a new tab</span>
              </label>
            )}
            {error && <p className="blogFieldError">{error}</p>}
            <div className="blogModalActions">
              <button
                className="adminButton"
                type="button"
                onClick={closeDialog}
              >
                Cancel
              </button>
              <button className="adminButton primary" type="submit">
                {dialog === "link" ? "Apply Link" : "Insert Image"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
