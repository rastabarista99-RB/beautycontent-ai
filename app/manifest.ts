import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BeautyContent AI",
    short_name: "BeautyContent",
    description: "AI marketing assistant for beauty businesses.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#7C3AED",
    icons: [],
  };
}
