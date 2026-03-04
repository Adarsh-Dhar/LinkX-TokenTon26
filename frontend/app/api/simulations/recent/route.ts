export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') || '5';
    
    const response = await fetch(`http://localhost:8080/simulations/recent?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return Response.json(
        { error: 'Failed to fetch recent simulations' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return Response.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
