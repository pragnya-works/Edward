import { ArrowRight, PaperclipIcon } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState, useEffect } from "react";
import { TextAnimate } from "@workspace/ui/components/text-animate";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

const SUGGESTIONS = [
  "Build a high-fidelity SaaS landing page with Bento grid layouts and subtle Framer Motion reveals",
  "Create a complex multi-step onboarding flow with persistent state and Zod schema validation",
  "Implement a responsive, accessible admin dashboard with dynamic sidebars and CSS Grid",
  "Design a dark-themed AI command palette with fuzzy search and keyboard navigation",
  "Develop a glassmorphic data visualization dashboard using Recharts and interactive filters"
];

export default function Promptbar() {
  const [inputValue, setInputValue] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="w-full rounded-2xl border-white/10 backdrop-blur-md shadow-xl py-0">
      <div className="flex flex-col relative">
        <div className="relative">
          {inputValue === "" && (
            <div className="absolute inset-0 px-4 py-4 pointer-events-none z-0">
              <TextAnimate
                key={suggestionIndex}
                animation="blurInUp"
                by="word"
                className="text-base text-gray-500"
                text={SUGGESTIONS[suggestionIndex] as string}
              />
            </div>
          )}
          <Textarea
            placeholder=""
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="min-h-[120px] resize-none border-0 bg-transparent p-4 text-base text-white placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 relative z-10"
          />
        </div>
        <div className="flex items-center justify-between px-6 py-4 bg-input/30">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full p-0 bg-input/80"
              >
                <PaperclipIcon className="h-4 w-4 text-white" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Attach images</p>
            </TooltipContent>
          </Tooltip>

          <Button
            className="shrink-0 rounded-full px-5 py-2 text-sm font-medium shadow-sm"
          >
            Build now
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}