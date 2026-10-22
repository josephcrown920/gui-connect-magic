import { z } from "zod";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } };
export type ChatMessage = { role: string; content: string | ChatPart[] };
export const attachmentSchema = z
  .object({
    name: z.string().min(1).max(300),
    kind: z.enum(["image", "video"]),
    mime: z.enum([
      "image/png",
      "image/jpeg",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/mpeg",
      "video/mov",
      "video/quicktime",
    ]),
    data: z
      .string()
      .min(4)
      .max(28 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .refine((a) => a.mime.startsWith(`${a.kind}/`), "Attachment type does not match its MIME type");
export const attachmentsSchema = z
  .array(attachmentSchema)
  .max(3)
  .refine(
    (a) => a.reduce((size, x) => size + x.data.length, 0) <= 40 * 1024 * 1024,
    "Attachments are too large",
  );
export type ChatAttachment = z.infer<typeof attachmentSchema>;
export function multimodalContent(
  text: string,
  attachments: ChatAttachment[],
): string | ChatPart[] {
  if (!attachments.length) return text;
  return [
    { type: "text", text },
    ...attachments.map((a) => {
      const url = `data:${a.mime};base64,${a.data}`;
      return a.kind === "image"
        ? { type: "image_url" as const, image_url: { url } }
        : { type: "video_url" as const, video_url: { url } };
    }),
  ];
}
