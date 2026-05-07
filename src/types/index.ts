export type Attribution = {
  dataset_id?: string;
  source_url: string;
  last_updated?: string;
};

export type ToolError = {
  error: "upstream_unreachable" | "not_found" | "invalid_input" | "rate_limited" | "out_of_scope";
  message: string;
  suggestion?: string;
};
