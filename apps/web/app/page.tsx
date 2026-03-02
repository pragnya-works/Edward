import { Metadata } from "next";
import Home from "@/components/home/home";

export const metadata: Metadata = {
  title: "Edward",
  description:
    "Edward helps you design and ship modern web experiences with AI-assisted workflows.",
};

export default function Page() {
  return <Home />;
}
