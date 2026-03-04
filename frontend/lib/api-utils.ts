/**
 * Safely parse JSON from a fetch response.
 * Returns the parsed data or throws a helpful error if parsing fails.
 * 
 * @param response - The fetch response object
 * @returns Parsed JSON data
 * @throws Error if response is not valid JSON
 */
export async function safeJsonParse<T = any>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  
  // Check if the response is JSON before attempting to parse
  if (contentType && !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(
      `Expected JSON response but got ${contentType}. Response: ${text.substring(0, 200)}`
    );
  }

  try {
    return await response.json();
  } catch (error) {
    // If JSON parsing fails, try to get the text for better error message
    let text = '';
    try {
      text = await response.text();
    } catch {
      // Response body might already be consumed
    }
    
    const errorMessage = text.startsWith('<!DOCTYPE') || text.startsWith('<html')
      ? 'Server returned HTML instead of JSON (likely an error page)'
      : `Invalid JSON response: ${text.substring(0, 200)}`;
    
    throw new Error(errorMessage);
  }
}

/**
 * Make a fetch request with automatic JSON parsing and error handling.
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @returns Parsed JSON data
 * @throws Error if request fails or response is not valid JSON
 */
export async function fetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, options);
  
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorData = await safeJsonParse(response);
      if (errorData.error) {
        errorMessage = errorData.error;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // If we can't parse error as JSON, use the status text
    }
    
    throw new Error(errorMessage);
  }
  
  return safeJsonParse<T>(response);
}
