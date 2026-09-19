export async function GET() {
  return Response.json({
    identity: "anonymous-browser",
    predictions: [],
    note: "The runnable prototype stores ME data in browser localStorage. Supabase tables are defined in supabase/schema.sql.",
  });
}
