import { NextResponse } from 'next/server';
import mqtt from 'mqtt';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { device, state } = body;

    if (!device || !state) {
      return NextResponse.json({ error: 'Missing device or state' }, { status: 400 });
    }

    // Connect to the local Mosquitto broker (assumed running on the same machine)
    // In production, this would be an environment variable.
    const client = mqtt.connect('mqtt://127.0.0.1:1883');

    return new Promise<NextResponse>((resolve) => {
      client.on('connect', () => {
        const payload = JSON.stringify({ device, state });
        client.publish('iris/room/action', payload, { qos: 0 }, (error) => {
          if (error) {
            console.error('MQTT publish error:', error);
            client.end();
            resolve(NextResponse.json({ error: 'Failed to publish to MQTT' }, { status: 500 }));
          } else {
            console.log(`[MQTT] Published ${payload} to iris/room/action`);
            client.end();
            resolve(NextResponse.json({ success: true, message: `Command sent: ${device} -> ${state}` }));
          }
        });
      });

      client.on('error', (err) => {
        console.error('MQTT connection error:', err);
        client.end();
        resolve(NextResponse.json({ error: 'Failed to connect to MQTT broker' }, { status: 500 }));
      });
    });

  } catch (error: any) {
    console.error('Error in /api/room-action:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
