# Career Ops - Frontend Dashboard

The frontend component of the Career Ops ecosystem. It is a modern React application built with Vite that provides a sleek interface for evaluating job postings, tracking applications, and generating cold emails.

## Tech Stack
- **React 18**
- **Vite**
- **Vanilla CSS** (Responsive layout with dark mode hints)
- **Lucide React** (Icons)

## Setup & Running Locally

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The app will start on `http://localhost:5173`. 
*Note: The frontend requires the `server` to be running concurrently on `http://localhost:3000` to function properly.*

## Features
- **Job Evaluator:** Paste a URL to scrape and evaluate using Gemini AI.
- **Application Tracker:** Visual spreadsheet showing your Excel DB contents.
- **Cold Email Generator:** Formats recruiter and manager emails based on your custom `config/emails.json` templates, with smart preservation of UI formatting and clickable links.
- **Auto-Caching:** Automatically preserves raw scraped job descriptions to prevent repeated network calls to job boards.
