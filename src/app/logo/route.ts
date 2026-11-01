import { getOptionalUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

// The signed-in person's church logo (see ChurchLogo). The address carries ?v=<when it
// last changed>, so the browser can keep it until an admin uploads a new one.
export async function GET() {
  const user = await getOptionalUser();
  if (!user) return new Response("Not found", { status: 404 });
  const logo = await prisma.churchLogo.findUnique({ where: { organizationId: user.organizationId } });
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
