import { useState } from "react";
import { Sheet, SheetContent } from "@edward/ui/components/sheet";
import AuthenticatedPromptbar from "@/components/authenticatedPromptbar";
import { ChatMessageList } from "@/components/chat/messages/chatMessageList";
import { SandboxPanel } from "@/components/chat/sandbox/sandboxPanel";
import { useSandboxActions, useSandboxIsOpen } from "@/stores/sandbox/hooks";
import { NotificationOptIn } from "@/components/chat/notificationOptIn";
import { useChatWorkspaceContext } from "@/components/chat/chatWorkspaceContext";

export function ChatWorkspaceMobile() {
  const sandboxOpen = useSandboxIsOpen();
  const { closeSandbox } = useSandboxActions();
  const { chatId } = useChatWorkspaceContext();
  const [isTopPromptContextVisible, setIsTopPromptContextVisible] = useState(false);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <div className="relative flex flex-col h-full w-full min-w-0">
        <div className="flex-1 min-h-0">
          <ChatMessageList />
        </div>
        <div className="shrink-0 w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
          <NotificationOptIn
            chatId={chatId}
            suppressWhenTopContextVisible={isTopPromptContextVisible}
          />
          <AuthenticatedPromptbar
            onTopContextVisibilityChange={setIsTopPromptContextVisible}
          />
        </div>
      </div>

      <Sheet
        open={sandboxOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeSandbox();
          }
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full max-w-none p-0 gap-0 border-l border-workspace-border bg-workspace-bg"
        >
          <SandboxPanel />
        </SheetContent>
      </Sheet>
    </div>
  );
}
