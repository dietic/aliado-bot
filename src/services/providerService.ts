// src/services/providerService.ts

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { link } from "fs";

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
 * Fetch up to 3 providers by category slug + optional district(s) filter.
 * Handles the implicit many-to-many join table (_ProviderCategories with columns A and B).
 */
export async function getProvidersByCategory(
  categorySlug: string,
  district?: string | string[],
): Promise<Provider[]> {
  // 1️⃣ Lookup the category case-insensitively
  const { data: categoryRow, error: catError } = await supabase
    .from("Category")
    .select("id")
    .ilike("slug", categorySlug)
    .maybeSingle();

  console.log("categoryRow", categoryRow);
  if (catError) {
    throw new Error(
      `Category lookup failed for "${categorySlug}": ${catError.message}`,
    );
  }
  if (!categoryRow) {
    throw new Error(`Category "${categorySlug}" not found in Category table.`);
  }
  const categoryId: string = categoryRow.id;

  // 2️⃣ Pull the join‐table links from _ProviderCategories
  const { data: links, error: linkError } = await supabase
    .from("_ProviderCategories") // implicit join table named after your @relation
    .select("B") // B is the Provider.id foreign key
    .eq("A", categoryId); // A is the Category.id foreign key
  console.log("linkError", linkError);
  console.log("links", links);
  if (linkError) {
    throw new Error(
      `Failed to fetch provider–category links for "${categorySlug}": ${linkError.message}`,
    );
  }

  const providerIds = (links ?? []).map((row) => row.B as string);
  if (providerIds.length === 0) {
    return [];
  }

  // 3️⃣ Build the provider query
  let query = supabase
    .from("Provider")
    .select("firstName,lastName,phone")
    .in("id", providerIds)
    .limit(3);
  console.log("district", district);
  if (Array.isArray(district)) {
    // Case-insensitive OR for each district
    const orFilter = district.map((d) => `district.ilike.%${d}%`).join(",");
    query = query.or(orFilter);
  } else if (district) {
    // Single district – still case-insensitive
    query = query.ilike("district", `%${district}%`);
  }

  const { data: providers, error: provError } = await query;
  console.log("data", providers);
  if (provError) {
    throw new Error(`Provider fetch failed: ${provError.message}`);
  }

  return (providers ?? []) as Provider[];
}
