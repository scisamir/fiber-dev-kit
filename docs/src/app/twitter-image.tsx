import { ImageResponse } from "next/og";
import { OgImageMarkup, ogImageSize, ogImageContentType, ogImageAlt } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;
export const alt = ogImageAlt;

export default function Image() {
  return new ImageResponse(<OgImageMarkup />, size);
}
