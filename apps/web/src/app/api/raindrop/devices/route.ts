import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Devices management has been removed. Retained as stubs for backward compatibility.
export async function GET() {
  return NextResponse.json({ success: true, devices: [] });
}

export async function PATCH() {
  return NextResponse.json({ success: true, devices: [] });
}

export async function DELETE() {
  return NextResponse.json({ success: true, devices: [] });
}
