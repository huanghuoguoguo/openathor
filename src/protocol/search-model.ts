export type VectorIndexDocument = {
  path: string;
  hash: string;
  kind: string;
  title: string | null;
  terms: string[];
  vector: number[];
  preview: string;
};

export type VectorIndex = {
  schema_version: "openathor.vector_index.v1";
  generated_at: string;
  method: "deterministic_hash_embedding_v1";
  dimensions: number;
  documents: VectorIndexDocument[];
};
