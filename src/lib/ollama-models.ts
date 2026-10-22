/** Browser-safe catalog. Ollama connection details stay on the server. */
export const OLLAMA_MODELS = [
  { id: "qwen-vl-2b", name: "Qwen3-VL 2B · local", model: "qwen3-vl:2b", vision: true },
  { id: "qwen-vl-4b", name: "Qwen3-VL 4B · local", model: "qwen3-vl:4b", vision: true },
  {
    id: "nemotron-nano",
    name: "Nemotron 3 Nano · cloud",
    model: "nemotron-3-nano:30b-cloud",
    vision: false,
  },
  {
    id: "nemotron-super",
    name: "Nemotron 3 Super · cloud",
    model: "nemotron-3-super:cloud",
    vision: false,
  },
  {
    id: "nemotron-ultra",
    name: "Nemotron 3 Ultra · cloud",
    model: "nemotron-3-ultra:cloud",
    vision: false,
  },
  {
    id: "minimax-ollama",
    name: "MiniMax M3.1 Flash · cloud",
    model: "minimax-m3.1-flash:cloud",
    vision: false,
  },
] as const;
