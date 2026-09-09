export async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(35000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { ...options, signal });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(
      timeout.aborted
        ? 'La recherche a pris trop de temps. Réessayez avec une zone plus précise.'
        : 'Connexion impossible. Vérifiez votre connexion et réessayez.',
    );
  }
  let data: T & { error?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error('Le service ne répond pas correctement. Réessayez.');
  }
  if (!response.ok) throw new Error(data.error || 'La demande n’a pas abouti. Réessayez.');
  return data;
}
