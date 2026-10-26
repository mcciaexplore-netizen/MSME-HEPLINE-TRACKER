import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { NextResponse, type NextRequest } from "next/server";
import { adminFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HeaderError } from "@/lib/ingest/parse";
import { processUpload, type UploadInput } from "@/lib/ingest/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const asStream = (f: File) => Readable.fromWeb(f.stream() as unknown as WebReadableStream);

export async function POST(req: NextRequest) {
  const admin = await adminFromRequest(req);
  if (admin instanceof NextResponse) return admin;
  const form = await req.formData();
  const dialer = form.get("dialer");
  const zoho = form.get("zoho");
  const files: UploadInput = {};
  if (dialer instanceof File && dialer.size > 0) files.dialer = { name: dialer.name, input: asStream(dialer) };
  if (zoho instanceof File && zoho.size > 0) files.zoho = { name: zoho.name, input: asStream(zoho) };
  if (!files.dialer && !files.zoho) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
  try {
    const { summary } = await processUpload(prisma, files, admin);
    return NextResponse.json({ summary });
  } catch (e) {
    if (e instanceof HeaderError) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error(e);
    return NextResponse.json({ error: "The upload couldn't be processed. Check the file is a CSV export and try again." }, { status: 500 });
  }
}
