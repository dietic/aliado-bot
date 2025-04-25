import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ——————————————
// Supabase client setup
// ——————————————
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // use your service-role key for unrestricted access
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// ——————————————
// Types
// ——————————————
export interface Provider {
  firstName: string;
  lastName: string;
  phone: string;
}

// ——————————————
// Service: fetch providers by category + district
// ——————————————
export async function getProvidersByCategory(
  categorySlug: string,
  district?: string,
): Promise<Provider[]> {
  // 1️⃣ Lookup the category
  const { data: categoryRow, error: catError } = await supabase
    .from("Category")
    .select("id")
    .eq("slug", categorySlug.toUpperCase())
    .single();

  if (catError) {
    throw new Error(
      `Category lookup failed for "${categorySlug}": ${catError.message}`,
    );
  }
  if (!categoryRow) {
    throw new Error(`Category "${categorySlug}" not found.`);
  }
  const categoryId: string = categoryRow.id;

  // 2️⃣ Pull provider IDs from the join table
  const { data: links, error: linkError } = await supabase
    .from("_ProviderCategories")
    .select("providerId")
    .eq("CategoryId", categoryId);

  if (linkError) {
    throw new Error(
      `Failed to fetch provider–category links: ${linkError.message}`,
    );
  }
  const providerIds = links.map((l) => l.providerId);

  // If no providers found for this category, short-circuit
  if (providerIds.length === 0) {
    return [];
  }

  // 3️⃣ Fetch providers with optional district filter
  const districtFilter = district ? `%${district}%` : "%";
  const { data: providers, error: provError } = await supabase
    .from("Provider")
    .select("firstName,lastName,phone")
    .in("id", providerIds)
    .ilike("district", districtFilter)
    .limit(3);

  if (provError) {
    throw new Error(`Provider fetch failed: ${provError.message}`);
  }

  return providers as Provider[];
}
