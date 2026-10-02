import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { FileText, Loader2, Paperclip, Send, User, Sparkles, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";
import { openAssetInNewTab } from "@/lib/protected-file";
import { safeAssetUrl } from "@/lib/storage-url";

export type ChatAttachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  url?: string;
  previewUrl?: string;
  storageKey?: string;
  extractedText?: string;
};

type UploadedAttachment = {
  url?: string;
  previewUrl?: string;
  key?: string;
  mime?: string;
  size?: number;
};

/**
 * Message type matching server-side LLM Message interface
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   * Should match the format used by invokeLLM on the server.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   * Typically you'll call a tRPC mutation here to invoke the LLM.
   */
  onSendMessage: (content: string, attachments?: ChatAttachment[]) => void;

  /** Upload a selected file and return its protected LearnHub storage reference. */
  onUploadAttachment?: (file: File, onProgress?: (progress: number) => void) => Promise<UploadedAttachment | null>;

  /**
   * Whether the AI is currently generating a response
   */
  isLoading?: boolean;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Height of the chat box (default: 600px)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   * Click to send directly
   */
  suggestedPrompts?: string[];
};

/**
 * A ready-to-use AI chat box component that integrates with the LLM system.
 *
 * Features:
 * - Matches server-side Message interface for seamless integration
 * - Markdown rendering with Streamdown
 * - Auto-scrolls to latest message
 * - Loading states
 * - Uses global theme colors from index.css
 *
 * @example
 * ```tsx
 * const ChatPage = () => {
 *   const [messages, setMessages] = useState<Message[]>([
 *     { role: "system", content: "You are a helpful assistant." }
 *   ]);
 *
 *   const chatMutation = trpc.ai.chat.useMutation({
 *     onSuccess: (response) => {
 *       // Assuming your tRPC endpoint returns the AI response as a string
 *       setMessages(prev => [...prev, {
 *         role: "assistant",
 *         content: response
 *       }]);
 *     },
 *     onError: (error) => {
 *       console.error("Chat error:", error);
 *       // Optionally show error message to user
 *     }
 *   });
 *
 *   const handleSend = (content: string) => {
 *     const newMessages = [...messages, { role: "user", content }];
 *     setMessages(newMessages);
 *     chatMutation.mutate({ messages: newMessages });
 *   };
 *
 *   return (
 *     <AIChatBox
 *       messages={messages}
 *       onSendMessage={handleSend}
 *       isLoading={chatMutation.isPending}
 *       suggestedPrompts={[
 *         "Explain quantum computing",
 *         "Write a hello world in Python"
 *       ]}
 *     />
 *   );
 * };
 * ```
 */
export function AIChatBox({
  messages,
  onSendMessage,
  onUploadAttachment,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [attachmentStatus, setAttachmentStatus] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter out system messages
  const displayMessages = messages.filter((msg) => msg.role !== "system");

  // Calculate min-height for last assistant message to push user message to top
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;

      // Reserve space for:
      // - padding (p-4 = 32px top+bottom)
      // - user message: 40px (item height) + 16px (margin-top from space-y-4) = 56px
      // Note: margin-bottom is not counted because it naturally pushes the assistant message down
      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;

      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  // Scroll to bottom helper function with smooth animation
  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement;

    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if ((!trimmedInput && attachments.length === 0) || isLoading || uploading) return;

    onSendMessage(trimmedInput, attachments);
    setInput("");
    setAttachments([]);
    setAttachmentStatus("");

    // Scroll immediately after sending
    scrollToBottom();

    // Keep focus on input
    textareaRef.current?.focus();
  };

  const readTextPreview = async (file: File): Promise<string | undefined> => {
    const extension = file.name.toLowerCase().split(".").pop() || "";
    const textExtensions = new Set([
      "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "toml",
      "html", "htm", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cc", "cpp",
      "h", "hpp", "sql", "log", "ini", "conf", "sh", "rb", "go", "rs", "php", "vue", "svelte",
    ]);
    if (!file.type.startsWith("text/") && !textExtensions.has(extension)) return undefined;
    try {
      const maxBytes = 128 * 1024;
      const preview = await file.slice(0, maxBytes).text();
      const cleaned = preview.replace(/\u0000/g, "").slice(0, 8000);
      return cleaned ? `${cleaned}${file.size > maxBytes || preview.length > 8000 ? "\n[تم اقتطاع معاينة النص]" : ""}` : undefined;
    } catch {
      return undefined;
    }
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length || !onUploadAttachment) return;
    if (attachments.length + selected.length > 5) {
      setAttachmentStatus("يمكن إرفاق ٥ ملفات كحد أقصى في الرسالة الواحدة.");
      return;
    }
    setUploading(true);
    setAttachmentStatus("");
    const added: ChatAttachment[] = [];
    try {
      for (const file of selected) {
        setUploadProgress(0);
        const stored = await onUploadAttachment(file, value => setUploadProgress(Math.max(0, Math.min(100, Number(value) || 0))));
        if (!stored?.key && !stored?.url) continue;
        const attachment: ChatAttachment = {
          id: stored.key || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name || "ملف مرفق",
          mime: stored.mime || file.type || "application/octet-stream",
          size: stored.size || file.size,
          url: safeAssetUrl({ url: stored.url, storageKey: stored.key }) || undefined,
          previewUrl: stored.previewUrl,
          storageKey: stored.key,
          extractedText: await readTextPreview(file),
        };
        added.push(attachment);
        setAttachments(current => [...current, attachment]);
      }
      setAttachmentStatus(added.length ? `تم رفع ${added.length} ملف${added.length > 1 ? "ات" : ""} وإرفاقه بالمحادثة.` : "لم يتم رفع أي ملف.");
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm",
        className
      )}
      style={{ height }}
    >
      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-4">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <Sparkles className="size-12 opacity-20" />
                <p className="text-sm">{emptyStateMessage}</p>
              </div>

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => onSendMessage(prompt)}
                      disabled={isLoading}
                      className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => {
                // Apply min-height to last message only if NOT loading (when loading, the loading indicator gets it)
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-3",
                      message.role === "user"
                        ? "justify-end items-start"
                        : "justify-start items-start"
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    {message.role === "assistant" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="size-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2.5",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </p>
                      )}
                      {message.attachments?.length ? (
                        <div className="mt-2 grid gap-1.5">
                          {message.attachments.map(attachment => (
                            <button
                              type="button"
                              key={attachment.id}
                              onClick={() => void openAssetInNewTab(attachment.previewUrl || safeAssetUrl(attachment), attachment.name, attachment.mime)}
                              className="flex max-w-full items-center gap-2 rounded-md border border-current/15 bg-background/10 px-2.5 py-1.5 text-left text-xs hover:bg-background/20"
                              title="فتح الملف في تبويب جديد"
                            >
                              <FileText className="size-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                              <span className="shrink-0 opacity-70">{formatFileSize(attachment.size)}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {message.role === "user" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                        <User className="size-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div
                  className="flex items-start gap-3"
                  style={
                    minHeightForLastMessage > 0
                      ? { minHeight: `${minHeightForLastMessage}px` }
                      : undefined
                  }
                >
                  <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="size-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-2.5">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 p-4 border-t bg-background/50"
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map(attachment => (
              <span key={attachment.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
                <FileText className="size-3 shrink-0" />
                <span className="max-w-48 truncate">{attachment.name}</span>
                <button type="button" onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))} aria-label={`إزالة ${attachment.name}`} className="rounded p-0.5 hover:bg-background">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          {onUploadAttachment && (
            <>
              <input ref={fileInputRef} type="file" multiple hidden disabled={uploading || attachments.length >= 5} onChange={handleFilesSelected} />
              <Button type="button" variant="outline" size="icon" className="h-[38px] w-[38px] shrink-0" disabled={uploading || attachments.length >= 5} onClick={() => fileInputRef.current?.click()} aria-label="إرفاق ملف">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              </Button>
            </>
          )}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 max-h-32 resize-none min-h-9"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && attachments.length === 0) || isLoading || uploading}
            className="shrink-0 h-[38px] w-[38px]"
          >
            {isLoading || uploading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        {(uploading || attachmentStatus) && (
          <div role="status" className="text-xs text-muted-foreground">
            {uploading ? `جارٍ رفع الملفات${uploadProgress === null ? "…" : `… ${Math.round(uploadProgress)}%`}` : attachmentStatus}
          </div>
        )}
      </form>
    </div>
  );
}
