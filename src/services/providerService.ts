// src/services/providerService.ts

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// — Env-driven Supabase client setup
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// — Provider DTO
export interface Provider {
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Fetch up to 3 providers by category slug + optional district filter.
 * District may be a single string or an array of strings (for multiple districts).
 */
export async function getProvidersByCategory(
  categorySlug: string,
  district?: string | string[],
): Promise<Provider[]> {
  // 1️⃣ Normalize slug back to lowercase (your DB stores slugs like "tecnico-de-celular")
  const slugLower = categorySlug.toLowerCase();

  // 2️⃣ Lookup the category record (use maybeSingle to avoid throwing on zero matches)
  const { data: categoryRow, error: catError } = await supabase
    .from("Category")
    .select("id")
    .eq("slug", slugLower)
    .maybeSingle();

  if (catError) {
    throw new Error(
      `Category lookup failed for "${categorySlug}": ${catError.message}`,
    );
  }
  if (!categoryRow) {
    throw new Error(`Category "${categorySlug}" not found in Category table.`);
  }
  const categoryId: string = categoryRow.id;

  // 3️⃣ Pull the join‐table links
  const { data: links, error: linkError } = await supabase
    .from("_ProviderCategories")
    .select("providerId")
    .eq("CategoryId", categoryId);

  if (linkError) {
    throw new Error(
      `Failed to fetch provider–category links for "${categorySlug}": ${linkError.message}`,
    );
  }

  const providerIds = links.map((l) => l.providerId);
  if (providerIds.length === 0) {
    // no providers for that category → empty list
    return [];
  }

  // 4️⃣ Build the provider query, injecting ID filter + optional district logic
  let query = supabase
    .from("Provider")
    .select("firstName,lastName,phone")
    .in("id", providerIds)
    .limit(3);

  if (Array.isArray(district)) {
    // multiple districts → IN filter
    query = query.in("district", district);
  } else if (district) {
    // single district → case-insensitive LIKE
    query = query.ilike("district", `%${district}%`);
  }
  // if no district passed, we leave the query as-is (all districts)

  const { data: providers, error: provError } = await query;
  if (provError) {
    throw new Error(`Provider fetch failed: ${provError.message}`);
  }

  return (providers ?? []) as Provider[];
}
