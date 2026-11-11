/**
 * Reads a request's body, giving up as soon as it's longer than `limit`
 * bytes. Returns `null` when it's too big.
 */
export async function readBody(
  request: Request,
  limit: number
): Promise<Uint8Array | null> {
  const length = Number(request.headers.get("content-length"))
  if (length > limit) return null
  if (!request.body) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of request.body) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
