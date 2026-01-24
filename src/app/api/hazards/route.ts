import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const days = searchParams.get('days') || '30';

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(days));

    const hazards = await prisma.hazard.findMany({
      where: {
        date: { gte: fromDate },
        ...(status && { status }),
        ...(severity && { severity }),
      },
      orderBy: { date: 'desc' },
    });

    // Calculate days since last severe incident
    const lastSevere = await prisma.hazard.findFirst({
      where: { severity: 'high' },
      orderBy: { date: 'desc' },
    });

    const daysSinceLastSevere = lastSevere
      ? Math.floor((Date.now() - lastSevere.date.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Count by severity
    const severityCounts = await prisma.hazard.groupBy({
      by: ['severity'],
      _count: { id: true },
      where: { date: { gte: fromDate } },
    });

    // Count by status
    const statusCounts = await prisma.hazard.groupBy({
      by: ['status'],
      _count: { id: true },
      where: { date: { gte: fromDate } },
    });

    // Get recurring hazards (by tag/keyword)
    const tagCounts: Record<string, number> = {};
    for (const h of hazards) {
      if (h.tags) {
        const tags = h.tags.split(',').map((t) => t.trim());
        for (const tag of tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    const recurringHazards = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return NextResponse.json({
      hazards,
      daysSinceLastSevere,
      severityCounts: severityCounts.reduce(
        (acc, s) => ({ ...acc, [s.severity]: s._count.id }),
        {} as Record<string, number>
      ),
      statusCounts: statusCounts.reduce(
        (acc, s) => ({ ...acc, [s.status]: s._count.id }),
        {} as Record<string, number>
      ),
      recurringHazards,
    });
  } catch (error) {
    console.error('Hazards GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch hazards' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, description, severity, tags } = body;

    if (!date || !description || !severity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const hazard = await prisma.hazard.create({
      data: {
        date: new Date(date),
        sourceType: 'manual',
        description,
        severity,
        tags: tags || null,
      },
    });

    return NextResponse.json(hazard);
  } catch (error) {
    console.error('Hazards POST error:', error);
    return NextResponse.json({ error: 'Failed to create hazard' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, severity, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing hazard ID' }, { status: 400 });
    }

    const hazard = await prisma.hazard.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(severity && { severity }),
        ...(description && { description }),
      },
    });

    return NextResponse.json(hazard);
  } catch (error) {
    console.error('Hazards PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update hazard' }, { status: 500 });
  }
}
