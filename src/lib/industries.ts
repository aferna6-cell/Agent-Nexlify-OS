/**
 * The 8 industry clusters (Agent OS Direction v2 §3 / Decision 3).
 *
 * Signup uses a 2-step picker: pick a cluster (loads the vertical pack), then a
 * specific business type within it (tunes copy + example asks). The cluster id is
 * stored on BusinessProfile.industryCluster and the type on businessType; both are
 * available to every agent prompt for fine-tuning.
 */

export interface IndustryCluster {
  id: string;
  label: string;
  types: string[];
}

export const INDUSTRY_CLUSTERS: IndustryCluster[] = [
  {
    id: "food_beverage",
    label: "Food & Beverage",
    types: ["Restaurant", "Pizza shop", "Diner", "Coffee shop", "Bakery", "Ice cream shop", "Bar / pub"],
  },
  {
    id: "retail",
    label: "Retail",
    types: ["Convenience store", "Liquor store", "Clothing boutique", "Gift shop", "Hardware store", "Pet store", "Pharmacy"],
  },
  {
    id: "home_trade",
    label: "Home & Trade Services",
    types: ["Plumber", "Electrician", "HVAC", "Landscaper", "Roofing contractor", "Painter", "Handyman"],
  },
  {
    id: "automotive",
    label: "Automotive",
    types: ["Auto repair shop", "Tire shop", "Car wash", "Auto body shop", "Gas station"],
  },
  {
    id: "health_wellness",
    label: "Health & Wellness",
    types: ["Doctor's office", "Dentist", "Chiropractor", "Physical therapy clinic", "Gym", "Yoga studio"],
  },
  {
    id: "professional_services",
    label: "Professional Services",
    types: ["Accountant", "Lawyer", "Insurance agency", "Real estate agency", "Financial advisor"],
  },
  {
    id: "personal_services",
    label: "Personal Services",
    types: ["Hair salon", "Barber shop", "Nail salon", "Day spa", "Dry cleaner"],
  },
  {
    id: "childcare_education",
    label: "Childcare & Education",
    types: ["Daycare", "Tutoring center", "Dance studio", "Music school"],
  },
];

export function clusterById(id: string | null | undefined): IndustryCluster | undefined {
  if (!id) return undefined;
  return INDUSTRY_CLUSTERS.find((c) => c.id === id);
}

export function clusterLabel(id: string | null | undefined): string | undefined {
  return clusterById(id)?.label;
}
