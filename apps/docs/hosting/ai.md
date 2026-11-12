# AI features

Every AI feature is optional and runs on **your own models** — nothing about your things is sent to an outside AI
service. Each switches on when its setting is present; without them Ferret is a plain (and fast) inventory.

AI work happens in the background, one job at a time per kind, retried if a model is busy. **Nothing a model says is
applied by itself**: it becomes suggestions a person taps to accept — unless a household switches on
[Let AI fill in](../guide/ai#let-ai-fill-in) (empty fields only, off by default; you can make kinds the default for
this server's households under Settings → Server).

| Feature | Needs | What it does |
|---|---|---|
| Reading photos | `OLLAMA_URL` (a vision model, e.g. `qwen3-vl:8b`) | Describes each photo, reads text on it, suggests name, brand, model, serial number. Lists the things in a [room scan](../guide/room-scan) and where they are. |
| Reading documents | `DOCLING_URL` ([docling-serve](https://github.com/docling-project/docling-serve)); optionally `DOCLING_VLM_URL` | Turns PDFs and photos of paper into text, for search and suggestions. With `DOCLING_VLM_URL` (granite-docling behind an OpenAI-compatible API, e.g. vLLM), pages are read by that model instead of docling's standard pipeline. |
| Stronger answers | `CHAT_URL` (any OpenAI-compatible API, e.g. vLLM) | Ask Ferret, and reading receipts, warranties and manuals. Without it, the vision model does this too. |
| Smart search | `QDRANT_URL` + `OLLAMA_URL` (`EMBED_MODEL`) | Finds things by meaning, including inside documents. |
| Reranking | `RERANK_URL` | Better ordering of search results. |
| [AI helpers](../guide/ai) | `CHAT_URL` or `OLLAMA_URL` | Sorting imports, filters from plain words, replacement-cost estimates, typical upkeep. Possible duplicates by meaning also need smart search. |
| Speech to text | `SPEECH_URL` (an OpenAI-compatible `/v1/audio/transcriptions`, e.g. [speaches](https://github.com/speaches-ai/speaches) or vLLM with Whisper) | Saying a thing's name on a walkthrough. |

Changing `EMBED_MODEL` needs a new `QDRANT_COLLECTION` (the vectors are a different size). Use a separate collection
for each Ferret (e.g. one for testing).

Ask Ferret selects relevant sections from stored document text, retaining numbered instructions and safety notes.
Short receipts remain whole. Citations link to the original attachment and include section headings when available;
PDF page numbers are only meaningful when extraction provides page mapping (the current Markdown extraction does not).
Missing diagrams or button symbols require checking the original PDF. An excerpt that exceeds the budget is explicitly
incomplete, and Ask refuses to present it as a complete procedure.
Explicitly labelled warnings are retained verbatim if the generated answer omits them. Numbered-step counts and
document citation coverage provide structural checks; they cannot prove that every paraphrase is faithful.

`ASK_CONTEXT_TOKENS` defaults to **4096** for the input and reply together. Set it no higher than the answering model's
actual context setting; this variable does not change Ollama or load a different model. How-to replies reserve 37.5%
of that budget, capped at 3072 output tokens; factual replies use at most 512. A 256-token reserve covers API overhead.
Input tokens are estimated from text, not counted with a model-specific tokenizer. Check actual model usage during
staging; complex tokenization or reasoning can still exhaust context. Increasing the budget requires a model server
configured to support it. Ordinary factual answers stay concise.
