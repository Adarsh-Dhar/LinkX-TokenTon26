export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch('http://localhost:8080/trade/simulate/advanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return Response.json(
        { error: 'Failed to simulate trade' },
        { status: response.status }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      const text = await response.text();
      return Response.json(
        { error: 'Invalid JSON response from backend', details: text.substring(0, 200) },
        { status: 500 }
      );
    }
    return Response.json(data);
  } catch (error) {
    console.error('API Error:', error);
    return Response.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
