import { useCallback, useEffect, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  RemoveFormatting,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface MailRichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  toolbarActions?: ReactNode;
  className?: string;
}

const placeholderRules = [
  "before:content-[attr(data-placeholder)]",
  "before:text-muted-foreground",
  "before:float-left",
  "before:h-0",
  "before:pointer-events-none",
].map((rule) => `[&_p.is-editor-empty:first-child]:${rule}`);

const editorContentClass = cn(
  "min-h-44 w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-6 outline-none",
  "[&_p]:min-h-[1.5em]",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_strong]:font-semibold",
  "[&_h1]:my-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight",
  "[&_h2]:my-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight",
  "[&_h3]:my-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug",
  "[&_h4]:my-1.5 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:leading-snug",
  "[&_h5]:my-1 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:leading-normal",
  "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  ...placeholderRules
);

function ToolbarButton({
  pressed,
  disabled,
  onClick,
  title,
  children,
}: {
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Toggle
      size="sm"
      pressed={pressed}
      disabled={disabled}
      onPressedChange={onClick}
      title={title}
      aria-label={title}
      className="size-7"
    >
      {children}
    </Toggle>
  );
}

export function MailRichEditor({
  value,
  onChange,
  placeholder = "Write your message…",
  disabled,
  toolbarActions,
  className,
}: MailRichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      TextStyle,
      FontSize,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: editorContentClass,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const headingValue = ([1, 2, 3, 4, 5] as const)
    .find((level) => editor?.isActive("heading", { level }))
    ?.toString() ?? "paragraph";
  const fontSize = (editor?.getAttributes("textStyle").fontSize as string | undefined) ?? "default";
  const headingLabel = headingValue === "paragraph" ? "P" : `H${headingValue}`;
  const fontSizeLabel = fontSize === "default" ? "14" : fontSize.replace("px", "");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/70 bg-muted/40 px-1.5 py-1">
        <Select
          value={headingValue}
          onValueChange={(next) => {
            if (!editor || !next) return;
            if (next === "paragraph") {
              editor.chain().focus().setParagraph().run();
              return;
            }
            editor
              .chain()
              .focus()
              .setHeading({ level: Number(next) as 1 | 2 | 3 | 4 | 5 })
              .run();
          }}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="w-14" aria-label="Text style">
            <SelectValue>{headingLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paragraph">P</SelectItem>
            <SelectItem value="1">H1</SelectItem>
            <SelectItem value="2">H2</SelectItem>
            <SelectItem value="3">H3</SelectItem>
            <SelectItem value="4">H4</SelectItem>
            <SelectItem value="5">H5</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={fontSize}
          onValueChange={(next) => {
            if (!editor || !next) return;
            const chain = editor.chain().focus();
            if (next === "default") chain.unsetFontSize().run();
            else chain.setFontSize(next).run();
          }}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="w-20" aria-label="Font size">
            <SelectValue>{fontSizeLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[
              { value: "12px", label: "12" },
              { value: "default", label: "14" },
              { value: "16px", label: "16" },
              { value: "18px", label: "18" },
              { value: "24px", label: "24" },
              { value: "32px", label: "32" },
            ].map((size) => (
              <SelectItem key={size.value} value={size.value}>{size.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolbarButton
          title="Bold"
          pressed={editor?.isActive("bold")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          pressed={editor?.isActive("italic")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          pressed={editor?.isActive("underline")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Underline />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolbarButton
          title="Bulleted list"
          pressed={editor?.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          pressed={editor?.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolbarButton
          title="Link"
          pressed={editor?.isActive("link")}
          disabled={disabled}
          onClick={setLink}
        >
          <Link2 />
        </ToolbarButton>
        <ToolbarButton
          title="Clear formatting"
          disabled={disabled}
          onClick={() =>
            editor?.chain().focus().clearNodes().unsetAllMarks().run()
          }
        >
          <RemoveFormatting />
        </ToolbarButton>
        {toolbarActions && (
          <div className="ml-auto flex items-center gap-1 border-l border-border/70 pl-1.5">
            {toolbarActions}
          </div>
        )}
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
