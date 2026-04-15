// src/common/transformers.ts
export const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v !== null ? parseFloat(v) : null),
};