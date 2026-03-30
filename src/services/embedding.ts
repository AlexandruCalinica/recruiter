import OpenAI from "openai";
import { env } from "../env";

export const EMBEDDING_DIMENSIONS = 384;

const OPENAI_MODEL = "text-embedding-3-small";
const LOCAL_MODEL = "Xenova/all-MiniLM-L6-v2";

type Extractor = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;

// Lazy-loaded: model downloads on first call, cached after
let localPipeline: Extractor | null = null;

async function getLocalPipeline(): Promise<Extractor> {
  if (!localPipeline) {
    const { pipeline } = await import("@huggingface/transformers");
    localPipeline = (await (pipeline as Function)("feature-extraction", LOCAL_MODEL, {
      dtype: "fp32",
    })) as Extractor;
  }
  return localPipeline;
}

async function generateOpenAIEmbedding(text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: OPENAI_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

async function generateLocalEmbedding(text: string): Promise<number[]> {
  const extractor = await getLocalPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (env.EMBEDDING_PROVIDER === "openai") {
    return generateOpenAIEmbedding(text);
  }
  return generateLocalEmbedding(text);
}
