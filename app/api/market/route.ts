import { marketSnapshot } from "@/components/makji/demo-data";

export async function GET() {
  return Response.json(marketSnapshot);
}
