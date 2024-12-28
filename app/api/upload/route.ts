import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";

export async function POST(request: Request) {
  console.log("Received POST request to /api/upload");
  try {
    const data = await request.formData();
    const file: File | null = data.get("image") as unknown as File;

    if (!file) {
      console.log("No file received");
      return NextResponse.json(
        { success: false, error: "No file received" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const path = join(process.cwd(), "public", "uploads", file.name);
    await writeFile(path, buffer);

    const url = `/uploads/${file.name}`;

    console.log("File successfully uploaded:", url);
    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("Error in POST /api/upload:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
