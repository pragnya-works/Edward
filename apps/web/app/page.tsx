import type { Metadata } from "next";
import Home from "@/components/home/home";

export const metadata: Metadata = {
  title: "Home",
  description: "Build and ship production-ready apps by chatting with Edward.",
};

export default function Page() {
  return <Home />;
}
