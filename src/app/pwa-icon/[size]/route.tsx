import { ImageResponse } from "next/og";

// Draws the app icon (a lightbulb-ish dot on dark) at the requested size.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const size = Math.min(Math.max(parseInt((await params).size) || 192, 48), 1024);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <div
          style={{
            width: size * 0.45,
            height: size * 0.45,
            borderRadius: "50%",
            background: "#facc15",
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
