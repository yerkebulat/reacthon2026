# Qazyna - Enrichment Plant Analytical Dashboard

An analytical dashboard web application for an enrichment plant to help engineers and shift supervisors make operational decisions quickly.

## Features

- **Dashboard**: View production KPIs, downtime charts, water consumption, and priority signals on one screen
- **Data Upload**: Upload Excel files (technical journal, water consumption, downtime history) with automatic parsing
- **HSE Hazards**: Monitor safety incidents with automatic detection from downtime text and manual entry support
- **Signal System**: Color-coded indicators (green/yellow/red) for quick assessment of operational status

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Charts**: Recharts
- **Database**: SQLite via Prisma ORM
- **File Parsing**: xlsx library

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up the database:
```bash
npx prisma db push
```

3. Seed the database with demo data (uses files from `case_data/`):
```bash
npm run seed
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
qazyna/
├── prisma/               # Database schema
├── src/
│   ├── app/              # Next.js pages and API routes
│   │   ├── dashboard/    # Main dashboard page
│   │   ├── upload/       # Data upload page
│   │   ├── hazards/      # HSE hazards page
│   │   └── api/          # API endpoints
│   ├── components/       # React components
│   │   ├── ui/           # shadcn/ui components
│   │   └── ...
│   └── lib/              # Utilities
│       ├── parsers/      # Excel file parsers
│       ├── signals.ts    # Signal computation logic
│       └── config.ts     # Threshold configuration
├── config/               # Configuration files
├── scripts/              # Utility scripts
├── uploads/              # Uploaded files storage
└── case_data/            # Sample Excel files
```

## Data Sources

The app processes three Excel file types (Russian format):

1. **Technical Journal** (`technical_journal.xlsx`)
   - Mill productivity data per shift
   - Downtime records with reasons

2. **Water Consumption** (`water_consumption.xlsx`)
   - Daily water meter readings
   - Actual vs nominal consumption

3. **Downtime History** (`downtime.xlsx`)
   - Historical downtime by equipment
   - Classification: Mechanical/Electrical/Technological/Weather

## Signal Thresholds

Configurable in `config/thresholds.json`:

- **Productivity**: Green within 5% of target, yellow 5-10% below, red >10% below
- **Downtime**: Green <60 min/day, yellow 60-120 min, red >120 min
- **Water**: Green within 5% of nominal, yellow 5-15% over, red >15% over

## HSE Hazard Detection

Automatically detects safety hazards from downtime text using keywords:
- **High severity**: травм, взрыв, пожар, газ, авар
- **Medium severity**: утеч, задым, наруш, инцидент
- **Low severity**: безопас, СИЗ

## API Endpoints

- `POST /api/upload` - Upload and parse Excel files
- `GET /api/dashboard` - Fetch dashboard data with filters
- `GET /api/signals` - Compute priority signals
- `GET/POST/PATCH /api/hazards` - CRUD for HSE hazards

## Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run seed       # Seed database with demo data
npm run db:push    # Push schema changes to database
npm run db:studio  # Open Prisma Studio
```

## License

MIT

---

Hackathon 2026 Project
