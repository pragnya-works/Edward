import type { Metadata } from "next";
import ChatPageClient from "@/components/chat/chatPageClient";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "Chat",
  description: "Continue your project conversation and iterate with Edward.",
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  return <ChatPageClient chatId={id} />;
}
