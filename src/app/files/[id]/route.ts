import type { NextRequest } from "next/server";
import { getOptionalUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { contentTypeFor, openFile } from "@/lib/storage";

// Types a browser can show in a tab; everything else downloads.
const INLINE = /^(application\/pdf|image\/|audio\/|text\/plain)/;

export async function GET(request: NextRequest, ctx: RouteContext<"/files/[id]">) {
  const user = await getOptionalUser();
  if (!user) return new Response("Sign in to view this file.", { status: 401 });

  const { id } = await ctx.params;
  const attachment = await prisma.attachment.findFirst({
    where: { id, organizationId: user.organizationId, kind: "FILE" },
  });
  if (!attachment?.storageKey) return new Response("File not found.", { status: 404 });

  const body = await openFile(attachment.storageKey);
  if (!body) return new Response("File not found.", { status: 404 });

  const contentType = contentTypeFor(attachment.name) ?? "application/octet-stream";
  const disposition = INLINE.test(contentType) ? "inline" : "attachment";
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  });

  // Audio players ask for a slice of the file ("bytes=1000-") so they can
  // seek. That is answered when the whole file is in hand; a streamed file is
  // sent whole, which still plays but can't be scrubbed.
  if (Buffer.isBuffer(body)) {
    headers.set("Accept-Ranges", "bytes");
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const size = body.length;
      // "bytes=-500" means the last 500 bytes.
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      headers.set("Content-Length", String(end - start + 1));
      return new Response(new Uint8Array(body.subarray(start, end + 1)), { status: 206, headers });
    }
    headers.set("Content-Length", String(body.length));
    return new Response(new Uint8Array(body), { headers });
  }

  return new Response(body, { headers });
}
