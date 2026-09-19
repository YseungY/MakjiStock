export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));

  return Response.json(
    {
      ok: true,
      stored: "demo-memory",
      event: payload.event ?? "unknown",
      createdAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}
