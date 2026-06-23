# Career-Ops Web Dashboard

A complete, full-stack Web UI and AI-powered job search system built to automate and streamline your career operations. 

This repository started as a fork of the CLI-based `santifer/career-ops` but has been **completely re-architected into a modern Web Application (React + Node.js/Express)**. It replaces terminal commands with a sleek, user-friendly dashboard for evaluating jobs, tracking applications, and generating outreach materials.

## Features

- **AI Job Evaluator**: Paste any job URL and our AI (powered by Google Gemini and Groq) will analyze it against your personal `cv.md` to give you a match score, pros/cons, and tailored interview prep.
- **Visual Application Tracker**: An interactive, spreadsheet-backed (Excel) table to manage all your applications. Update statuses directly from the dropdown (Evaluated, Applied, Got OA, Interviewing, Offered, Rejected).
- **Automated Outreach**: Instantly generate highly personalized cold emails for recruiters and hiring managers based on your specific resume points.
- **Cover Letter & ATS CV Generator**: Uses Playwright to generate beautifully formatted, tailored PDF cover letters and CVs that match the job description.

## Tech Stack

- **Frontend**: React, Vite, CSS (Responsive & Modern)
- **Backend**: Node.js, Express
- **AI Integration**: Google Gemini API (`gemini-2.5-flash`) and Groq API (fast, free open-source models)
- **Database**: Excel (`applications.xlsx`)
- **PDF Generation**: Playwright HTML-to-PDF pipeline

## Getting Started

### 1. Prerequisites
- Node.js (v18 or higher)
- A free Google Gemini API Key (Get one at [Google AI Studio](https://aistudio.google.com/apikey))
- A free Groq API Key (Get one at [Groq Console](https://console.groq.com/keys))

### 2. Installation
Clone the repository and install dependencies for both the frontend and backend:

```bash
git clone https://github.com/daarun-jk/career-ops-web-ui.git
cd career-ops-web-ui

# Install Server Dependencies
cd server
npm install

# Install Frontend Dependencies
cd ../frontend
npm install
```

### 3. Configuration

Just like the original repository, you need to set up your profile and API keys before running the application.

**1. API Keys:** 
Inside the `server` directory, copy the example environment file:
```bash
cd server
cp .env.example .env
```
Open `.env` and add your API Keys:
```env
GEMINI_API_KEY=your_gemini_key_here
GROQ_API_KEY=your_groq_key_here
```

**2. Your Profile:** 
Copy the example profile template and edit it with your personal details:
```bash
cd ..
cp config/profile.example.yml config/profile.yml
```

**3. Your Resume:** 
Create a file named `cv.md` in the root of the project. Paste your resume in Markdown format here. The AI uses this to evaluate your fit against job descriptions.
*Pro-Tip: You can create role-specific resumes! If you select a specific role in the Dashboard (e.g., Cloud / DevOps), the server will look for `cv-cloud-devops.md`. If it doesn't exist, it safely falls back to `cv.md`.*

**4. Email Templates (Optional):** 
Add your standard email templates to `config/emails.json`. This file is used to generate personalized cold outreach emails.

**5. PDF Templates (Optional):**
The HTML templates used to generate your PDFs are located in the `templates/` folder (`cv-template.html` and `cover-letter-template.html`). You can safely edit the CSS in these files to customize the design of your generated PDFs.

### 4. Running the Application

You will need to run two terminal windows to start both the backend server and the frontend dashboard.

**Terminal 1 (Backend Server):**
```bash
cd server
npm run dev
```
*(Server will start on http://localhost:3000)*

**Terminal 2 (Frontend Dashboard):**
```bash
cd frontend
npm run dev
```
*(Dashboard will start on http://localhost:5173)*

Open your browser to `http://localhost:5173` and start evaluating jobs!

## Important Notes & Privacy
- **100% Local Data**: All your resumes, PDFs, and tracking databases are stored locally on your machine and are configured to be ignored by Git (`.gitignore`). Your data is never pushed to GitHub.
- **Playwright Setup**: If PDF generation fails, you may need to run `npx playwright install chromium` inside the server directory.
