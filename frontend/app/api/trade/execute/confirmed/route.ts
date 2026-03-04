export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch('http://localhost:8080/trade/execute/confirmed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return Response.json(
        { error: 'Failed to execute trade' },
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
