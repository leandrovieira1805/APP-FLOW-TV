export async function onRequest() {
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
