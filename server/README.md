# Career Ops - Jobs API Server

Node.js Express server for managing job applications via an Excel file. This server provides REST API endpoints to read from and write to an `applications.xlsx` Excel file, plus AI-powered job evaluation.

## Features

- ✅ **GET /api/jobs** - Retrieve all job applications as JSON
- ✅ **POST /api/jobs** - Add new job applications to the Excel sheet
- ✅ **POST /api/jobs/evaluate** - **NEW!** Evaluate a job posting URL using AI (Playwright + Gemini)
- ✅ **GET /api/health** - Health check endpoint
- ✅ **CORS Enabled** - Configured for `localhost:5173` (frontend)
- ✅ **Excel Management** - Automatic file creation with formatted headers
- ✅ **Error Handling** - Comprehensive error responses
- ✅ **AI Integration** - Gemini-powered job metadata extraction & recruiter discovery

## Prerequisites

- Node.js (v14 or higher)
- npm
- **For `/api/jobs/evaluate`:** Google Gemini API key (free tier available at https://aistudio.google.com/apikey)

## Installation

```bash
# Install dependencies
npm install
```

Dependencies:
- `express` - Web framework
- `exceljs` - Excel file manipulation
- `cors` - Cross-Origin Resource Sharing middleware
- `playwright` - Headless browser for web scraping
- `@google/generative-ai` - Google Gemini API client
- `dotenv` - Environment variable management

## Setup

### 1. Environment Configuration

Create a `.env` file in the server folder:

```bash
cp .env.example .env
```

Edit `.env` and add:
- `GEMINI_API_KEY` - Required for `/api/jobs/evaluate` endpoint
- `PORT` - Optional (default: 3000)

### 2. Get Gemini API Key (for AI job evaluation)

1. Visit https://aistudio.google.com/apikey
2. Click **Create API key in new project**
3. Copy the key
4. Add to `.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```

**Free Tier Details:**
- 15 requests per minute
- 1 million tokens per day
- No credit card required
- Perfect for job evaluation use cases

## Configuration

The server runs on port **3000** by default. You can change this by setting environment variables:

```bash
# Using .env file
PORT=3001
GEMINI_MODEL=gemini-2.5-flash

# Or via command line
PORT=3001 npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `GEMINI_API_KEY` | (none) | Google Gemini API key (required for /evaluate) |
| `GEMINI_MODEL` | gemini-2.5-flash | Gemini model to use |
| `NODE_ENV` | development | Environment mode |
| `FRONTEND_URL` | http://localhost:5173 | Frontend URL for CORS |

## Running the Server

```bash
# Start the server
npm start

# Or use Node directly
node index.js
```

Expected output:
```
🚀 Server running at http://localhost:3000
✅ CORS enabled for http://localhost:5173
📄 Excel file: /path/to/applications.xlsx

Endpoints:
  GET  http://localhost:3000/api/jobs
  POST http://localhost:3000/api/jobs
  GET  http://localhost:3000/api/health
```

## API Endpoints

### GET /api/jobs

Retrieve all job applications from the Excel file.

**Request:**
```bash
curl http://localhost:3000/api/jobs
```

**Response (200 OK):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "Date": "2024-01-15",
      "Company": "Tech Corp",
      "Role": "Senior Engineer",
      "Score": "4.5",
      "Status": "Interview",
      "URL": "https://example.com/job/123",
      "Notes": "Great culture fit"
    },
    {
      "Date": "2024-01-16",
      "Company": "StartUp Inc",
      "Role": "Full Stack Developer",
      "Score": "3.8",
      "Status": "Applied",
      "URL": "https://example.com/job/456",
      "Notes": "Remote position"
    }
  ]
}
```

### POST /api/jobs

Add a new job application to the Excel file.

**Request:**
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "Company": "Tech Corp",
    "Role": "Senior Engineer",
    "Date": "2024-01-15",
    "Score": "4.5",
    "Status": "Interview",
    "URL": "https://example.com/job/123",
    "Notes": "Great culture fit"
  }'
```

**Required Fields:**
- `Company` - Company name
- `Role` - Job title/role

**Optional Fields:**
- `Date` - Application date (defaults to today's date in YYYY-MM-DD format)
- `Score` - Rating/score for the position
- `Status` - Application status (e.g., "Applied", "Interview", "Offer")
- `URL` - Link to job posting
- `Notes` - Additional notes

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Job added successfully",
  "data": {
    "Company": "Tech Corp",
    "Role": "Senior Engineer",
    "Date": "2024-01-15",
    "Score": "4.5",
    "Status": "Interview",
    "URL": "https://example.com/job/123",
    "Notes": "Great culture fit"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Missing required fields. Please provide at least \"Company\" and \"Role\".",
  "receivedData": {}
}
```

### POST /api/jobs/evaluate - AI-Powered Job Evaluation

This endpoint automatically evaluates a job posting URL using AI:
- 🌐 **Scrapes** the job posting with Playwright
- 🤖 **Extracts** company, role, requisition ID using Gemini
- 👥 **Searches** for recruiters at that company
- 💾 **Saves** all data to Excel automatically

## Prerequisites

1. **Gemini API Key** (Free tier available)
   - Get it at: https://aistudio.google.com/apikey
   - Add to `.env`: `GEMINI_API_KEY=your_key_here`
   - Free tier: 15 RPM / 1M tokens/day

2. **Playwright** (automatically installed)
   - Uses headless Chromium to scrape job postings

## Quick Start

```bash
curl -X POST http://localhost:3000/api/jobs/evaluate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/careers/job/123"}'
```

## Request

```json
{
  "url": "https://example.com/careers/job/123"
}
```

## Response (201 Created)

```json
{
  "success": true,
  "message": "Job evaluated and saved successfully",
  "data": {
    "Date": "2024-01-15",
    "Company": "Tech Corporation",
    "Role": "Senior Software Engineer",
    "Score": "",
    "Status": "Evaluated",
    "URL": "https://example.com/careers/job/123",
    "Notes": "Auto-evaluated from posting",
    "ReqID": "REQ-2024-5678",
    "RecruiterName": "John Smith",
    "HiringManager": "Jane Doe"
  }
}
```

## What Happens Behind the Scenes

### 1. Scrape Job Posting
- Opens URL with headless Chromium browser
- Extracts all visible text (removes scripts/styles)
- Returns scraped text to Gemini

### 2. Extract with Gemini
Sends scraped text to Gemini 2.5 Flash with prompt:
```
Extract: company, role, req_id from this job posting
Return as JSON with exactly those 3 keys
```

### 3. Search for Recruiters
- Creates mock search results for "{Company} recruiters"
- Uses Gemini to extract recruiter names from results
- Identifies hiring manager names when available

### 4. Save to Excel
- Merges all extracted data
- Appends as new row to `applications.xlsx`
- Includes: Date, Company, Role, URL, ReqID, RecruiterName, HiringManager

## Error Responses

### Missing URL (400)
```json
{
  "success": false,
  "error": "Missing or invalid \"url\" field"
}
```

### Gemini Not Configured (500)
```json
{
  "success": false,
  "error": "Server not configured: GEMINI_API_KEY missing",
  "hint": "Add GEMINI_API_KEY to .env file"
}
```

### URL Not Accessible (500)
```json
{
  "success": false,
  "error": "Failed to scrape URL: Timeout of 10000ms exceeded",
  "details": "The page may require login or may not be accessible"
}
```

### Insufficient Content (400)
```json
{
  "success": false,
  "error": "URL did not contain enough text to analyze",
  "details": "The page may be behind login or not a job posting"
}
```

## JavaScript Examples

### Basic Fetch
```javascript
async function evaluateJob(url) {
  const response = await fetch('http://localhost:3000/api/jobs/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  
  if (response.ok) {
    const { data } = await response.json();
    console.log('Company:', data.Company);
    console.log('Role:', data.Role);
    console.log('Recruiter:', data.RecruiterName);
  } else {
    const error = await response.json();
    console.error('Error:', error.error);
  }
}

// Usage
evaluateJob('https://linkedin.com/jobs/view/123456789/');
```

### React Component
```javascript
import { useState } from 'react';

export function JobEvaluator() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleEvaluate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:3000/api/jobs/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      if (response.ok) {
        setResult(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="job-evaluator">
      <input 
        type="url"
        value={url} 
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste job posting URL..."
        disabled={loading}
      />
      <button onClick={handleEvaluate} disabled={loading}>
        {loading ? '⏳ Evaluating...' : '🤖 Evaluate'}
      </button>
      
      {error && <div className="error">{error}</div>}
      
      {result && (
        <div className="result">
          <h3>{result.Company}</h3>
          <p><strong>Role:</strong> {result.Role}</p>
          <p><strong>ID:</strong> {result.ReqID || 'N/A'}</p>
          <p><strong>Recruiter:</strong> {result.RecruiterName || 'Not found'}</p>
          <p><strong>Hiring Manager:</strong> {result.HiringManager || 'Not found'}</p>
          <a href={result.URL} target="_blank" rel="noopener noreferrer">
            View Original Posting
          </a>
        </div>
      )}
    </div>
  );
}
```

## Performance Notes

- **First request:** 30-60 seconds (Playwright browser startup)
- **Subsequent requests:** 15-30 seconds (browser pooling)
- **Timeout:** 10 seconds per URL fetch, variable Gemini API time
- **Rate limit:** 15 requests/minute (free tier Gemini quota)

## Troubleshooting

### "GEMINI_API_KEY not configured"
**Solution:** 
1. Get key at https://aistudio.google.com/apikey
2. Add to `.env`: `GEMINI_API_KEY=your_key_here`
3. Restart server

### "Timeout of 10000ms exceeded"
**Cause:** URL is slow to load or requires JavaScript rendering
**Solution:** Try again or check URL is correct

### "URL did not contain enough text"
**Cause:** Page is behind login, uses heavy JavaScript, or isn't a job posting
**Solution:** Verify the URL is publicly accessible

### Playwright Installation Issues
**Solution:** 
```bash
npm install --save-dev playwright
npx playwright install
```

## Integration with Existing Endpoints

After evaluation, the job is automatically added to the Excel file:

```javascript
// This fetches all jobs including recently evaluated ones:
async function getAllJobs() {
  const response = await fetch('http://localhost:3000/api/jobs');
  const { data } = await response.json();
  return data;
}
```

## Architecture

```
POST /api/jobs/evaluate
  ├─ Scrape URL (Playwright)
  ├─ Extract Job Info (Gemini)
  │  └─ Return: company, role, req_id
  ├─ Search for Recruiters (Mock)
  ├─ Extract Recruiter Info (Gemini)
  │  └─ Return: recruiter_name, hiring_manager
  ├─ Merge Data
  ├─ Save to Excel
  └─ Return JSON
```

## See Also

- [.env.example](.env.example) - Configuration template


Check if the server is running and verify Excel file status.

**Request:**
```bash
curl http://localhost:3000/api/health
```

**Response (200 OK):**
```json
{
  "success": true,
  "status": "ok",
  "message": "Server is running",
  "excelFile": "D:\\path\\to\\applications.xlsx",
  "excelExists": true
}
```

### GET /

Get API documentation and available endpoints.

**Request:**
```bash
curl http://localhost:3000/
```

**Response (200 OK):**
```json
{
  "name": "Career Ops - Jobs API Server",
  "version": "1.0.0",
  "endpoints": {
    "GET /api/jobs": "Retrieve all jobs from Excel",
    "POST /api/jobs": "Add a new job to Excel",
    "GET /api/health": "Server health check"
  },
  "corsOrigin": "http://localhost:5173"
}
```

## Excel File Structure

The server automatically creates an `applications.xlsx` file with the following columns:

| Column | Type | Description |
|--------|------|-------------|
| Date | String | Application date (YYYY-MM-DD) |
| Company | String | Company name |
| Role | String | Job title/role |
| Score | Number | Rating/score (e.g., 4.5/5) |
| Status | String | Application status |
| URL | String | Job posting URL |
| Notes | String | Additional notes |
| ReqID | String | Requisition ID (auto-filled by /evaluate) |
| RecruiterName | String | Recruiter name (auto-filled by /evaluate) |
| HiringManager | String | Hiring manager name (auto-filled by /evaluate) |

## Frontend Integration Example

### Using Fetch API

```javascript
// Get all jobs
async function getJobs() {
  const response = await fetch('http://localhost:3000/api/jobs');
  const result = await response.json();
  console.log(result.data);
}

// Add a new job
async function addJob(jobData) {
  const response = await fetch('http://localhost:3000/api/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Company: jobData.company,
      Role: jobData.role,
      Score: jobData.score,
      Status: jobData.status,
      URL: jobData.url,
      Notes: jobData.notes
    })
  });
  
  if (response.ok) {
    const result = await response.json();
    console.log('Job added:', result.data);
  }
}

// Usage
getJobs();
addJob({
  company: 'Tech Corp',
  role: 'Senior Engineer',
  score: 4.5,
  status: 'Interview',
  url: 'https://example.com/job/123',
  notes: 'Great opportunity'
});
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:
```bash
# Use a different port
PORT=3001 npm start
```

### CORS Errors

Make sure your frontend is running on `http://localhost:5173`. If using a different port, update the CORS configuration in `index.js`:

```javascript
app.use(cors({
    origin: 'http://localhost:YOUR_PORT',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));
```

### Excel File Permission Denied

Ensure no other application is holding a lock on `applications.xlsx`. Close any open Excel instances if the error persists.

### Module Not Found Errors

Reinstall dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Development

### Scripts

Add to `package.json`:
```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js"
}
```

For development with auto-restart on file changes:
```bash
npm install --save-dev nodemon
npm run dev
```

## License

Part of the Career Ops project. See the main project LICENSE file for details.

