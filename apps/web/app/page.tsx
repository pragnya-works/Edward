import { Metadata } from "next";
import Home from "@/components/home/home";

export const metadata: Metadata = {
  title: "Edward",
  description:
    "Explore an AI app builder with a custom agent runtime, sandbox builds, and streamed runs.",
};

export default function Page() {
  return <Home />;
}
