import { ArrowRight, PaperclipIcon } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@edward/ui/components/button";
import { Card } from "@edward/ui/components/card";
import { Textarea } from "@edward/ui/components/textarea";
import { TextAnimate } from "@edward/ui/components/textAnimate";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipPositioner,
} from "@edward/ui/components/tooltip";
import { useIsMobile } from "@edward/ui/hooks/useMobile";
import { LoginModal } from "@edward/ui/components/ui/loginModal";
import { BYOK } from "@edward/ui/components/ui/byok";
import { Provider } from "@edward/shared/constants";

const SUGGESTIONS: string[] = [
  "Build a high-fidelity SaaS landing page with Bento grid layouts and subtle Framer Motion reveals",
  "Create a complex multi-step onboarding flow with persistent state and Zod schema validation",
  "Implement a responsive, accessible admin dashboard with dynamic sidebars and CSS Grid",
  "Design a dark-themed AI command palette with fuzzy search and keyboard navigation",
  "Develop a glassmorphic data visualization dashboard using Recharts and interactive filters",
];

interface PromptbarProps {
  isAuthenticated?: boolean;
  onSignIn?: () => void | Promise<void>;
  onProtectedAction?: () => void | Promise<void>;
  hasApiKey?: boolean | null;
  isApiKeyLoading?: boolean;
  apiKeyError?: string;
  onSaveApiKey?: (
    apiKey: string,
    onValidate: (key: string) => void,
    onClose: () => void,
    provider: Provider,
    model?: string,
  ) => Promise<boolean>;
  preferredModel?: string;
}

export default function Promptbar({
  isAuthenticated = false,
  onSignIn,
  onProtectedAction,
  hasApiKey = null,
  isApiKeyLoading = false,
  apiKeyError = "",
  onSaveApiKey,
  preferredModel,
}: PromptbarProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showBYOK, setShowBYOK] = useState(false);
  const isMobile = useIsMobile();
  const initialLoadTriggered = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const startInterval = () => {
      interval = setInterval(() => {
        setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length);
      }, 4000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (interval) clearInterval(interval);
      } else {
        if (interval) clearInterval(interval);
        startInterval();
      }
    };

    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleProtectedAction = useCallback(() => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
    } else if (hasApiKey !== true) {
      if (!isApiKeyLoading) setShowBYOK(true);
    } else {
      onProtectedAction?.();
    }
  }, [isAuthenticated, hasApiKey, isApiKeyLoading, onProtectedAction]);

  useEffect(() => {
    if (
      !initialLoadTriggered.current &&
      isAuthenticated &&
      hasApiKey === false &&
      !isApiKeyLoading
    ) {
      initialLoadTriggered.current = true;
      setShowBYOK(true);
    }
  }, [isAuthenticated, hasApiKey, isApiKeyLoading]);

  const ActionButton = isMobile ? (
    <Button
      type="button"
      size="icon"
      className="rounded-full"
      onClick={handleProtectedAction}
      aria-label="Build now"
    >
      <ArrowRight className="h-3.5 w-3.5" />
    </Button>
  ) : (
    <Button
      type="button"
      className="shrink-0 rounded-full px-5 py-2 text-sm font-medium shadow-sm"
      onClick={handleProtectedAction}
    >
      Build now
      <ArrowRight className="ml-1 h-3.5 w-3.5" />
    </Button>
  );

  return (
    <Card className="w-full rounded-2xl border-border bg-card/80 backdrop-blur-md shadow-xl py-0">
      <div className="flex flex-col relative">
        <div className="relative">
          {!inputValue && (
            <div className="absolute inset-0 px-4 py-4 pointer-events-none z-0">
              <TextAnimate
                key={suggestionIndex}
                animation="blurInUp"
                by="word"
                className="text-base text-gray-500"
                text={SUGGESTIONS[suggestionIndex]!}
              />
            </div>
          )}
          <Textarea
            placeholder=""
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="min-h-25 md:min-h-30 resize-none border-0 bg-transparent p-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 relative z-10"
          />
        </div>
        <div className="flex items-center justify-between px-6 py-4 bg-input/30">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full p-0 bg-input/80"
                  onClick={handleProtectedAction}
                  aria-label="Attach images"
                >
                  <PaperclipIcon className="h-4 w-4 text-foreground" />
                </Button>
              }
            />
            <TooltipPositioner side="top" align="center">
              <TooltipContent>Attach images</TooltipContent>
            </TooltipPositioner>
          </Tooltip>
          {ActionButton}
        </div>
      </div>
      {showLoginModal && (
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSignIn={onSignIn}
        />
      )}
      {showBYOK && isAuthenticated && (
        <BYOK
          isOpen={showBYOK}
          onClose={() => setShowBYOK(false)}
          onValidate={() => {
            onProtectedAction?.();
            setShowBYOK(false);
          }}
          onSaveApiKey={onSaveApiKey}
          preferredModel={preferredModel}
          error={apiKeyError}
        />
      )}
    </Card>
  );
}
