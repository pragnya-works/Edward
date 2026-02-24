import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ChatPageClient from "@/components/chat/chatPageClient";
import { ChatRouteNotFoundState } from "@/components/chat/chatRouteNotFoundState";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const DEFAULT_API_URL = "http://localhost:8000";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CHAT_ID_MIN_LENGTH = 20;
const CHAT_ID_MAX_LENGTH = 64;

export const metadata: Metadata = {
  title: "Chat",
  description: "Continue your project conversation and iterate with Edward.",
};

async function ensureChatIsAccessible(chatId: string): Promise<void> {
  const incomingHeaders = await headers();
  const cookieHeader = incomingHeaders.get("cookie");

  const response = await fetch(
    `${API_BASE_URL}/chat/${chatId}/history`,
    {
      method: "GET",
      cache: "no-store",
      headers: cookieHeader
        ? {
            cookie: cookieHeader,
          }
        : undefined,
    },
  );

  if (response.status === 404 || response.status === 403) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load chat ${chatId} (status ${response.status})`,
    );
  }
}

function isLikelyChatId(chatId: string): boolean {
  return (
    chatId.length >= CHAT_ID_MIN_LENGTH &&
    chatId.length <= CHAT_ID_MAX_LENGTH &&
    CHAT_ID_PATTERN.test(chatId)
  );
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  if (!isLikelyChatId(id)) {
    return <ChatRouteNotFoundState variant="invalid_id" />;
  }
  await ensureChatIsAccessible(id);
  return <ChatPageClient chatId={id} />;
}
