import { NextResponse } from "next/server";
import { getGuardian } from "@/lib/guardian/adapters";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const guardian = getGuardian();
  if (!guardian) return new NextResponse(null, { status: 503 });

  const { token } = await params;
  const scan = await guardian.store.getScanByToken(token);
  if (!scan) return new NextResponse(null, { status: 404 });

  const image = await guardian.images.getStream(scan.imagePath);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(image.stream, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
