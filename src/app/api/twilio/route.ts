import { NextResponse } from 'next/server';
import twilio from 'twilio';

export async function POST(request: Request) {
  try {
    const { to, message } = await request.json();

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json(
        { error: 'Twilio credentials are not configured in environment variables.' },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    const twilioResponse = await client.messages.create({
      body: message,
      from: fromNumber,
      to: process.env.EMERGENCY_CONTACT_NUMBER || to,
    });

    return NextResponse.json({ success: true, messageId: twilioResponse.sid });
  } catch (error) {
    console.error('Twilio Error:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS.' },
      { status: 500 }
    );
  }
}
