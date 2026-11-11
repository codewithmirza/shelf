// The one Storefront resource and the _meta every tool with a view carries (Gate 5, ADR-009).
export const STOREFRONT_URI = "ui://shelf/storefront.html";

export const viewMeta = {
  ui: { resourceUri: STOREFRONT_URI },
  "openai/outputTemplate": STOREFRONT_URI,
} as const;
