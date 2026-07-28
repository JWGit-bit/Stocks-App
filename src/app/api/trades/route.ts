import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const watchlistItemId = searchParams.get("watchlistItemId");

  let query = supabase
    .from("trades")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (watchlistItemId) {
    query = query.eq("watchlist_item_id", watchlistItemId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ trades: data });
}
