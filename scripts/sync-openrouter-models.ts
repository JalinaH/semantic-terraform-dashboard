import { syncOpenRouterCatalog } from "@/lib/model-policy/catalog";

async function main() {
  const result = await syncOpenRouterCatalog();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "OpenRouter catalog synchronization failed.");
  process.exitCode = 1;
});
