const express = require('express');
const cors = require('cors');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const { marked } = require('marked');

// Load environment variables
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const FILE_PATH = path.join(__dirname, 'applications.xlsx');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// Gmail API Setup
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || `http://localhost:${PORT}/api/gmail/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REDIRECT_URI
);

const TOKEN_PATH = path.join(__dirname, 'config', 'gmail_token.json');

if (fs.existsSync(TOKEN_PATH)) {
    try {
        const token = fs.readFileSync(TOKEN_PATH);
        oauth2Client.setCredentials(JSON.parse(token));
        console.log('✅ Gmail API: Authenticated using saved token');
    } catch (e) {
        console.log('⚠️ Gmail API: Failed to load saved token');
    }
}

// Middleware
app.use(cors({
    origin: function(origin, callback) {
        callback(null, true); // Allow any origin
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));
app.use(express.json());

// Serve output directory for PDF downloads
app.use('/output', express.static(path.join(__dirname, '..', 'output')));

// Default column headers
const DEFAULT_HEADERS = ['Company', 'Job Role', 'Job ID', 'Job Link', 'Status', 'Score', 'Resume Profile', 'Date Applied', 'Recruiter URL', 'Hiring Manager URL', 'Job Description'];

const Groq = require('groq-sdk');

async function generateAIContent(prompt, requestModel, temperature = 0.3, maxTokens = 8192) {
    const modelName = requestModel || GEMINI_MODEL;
    const isGroq = modelName.startsWith('openai/') || modelName.startsWith('qwen/') || modelName.startsWith('llama');

    const customInstructions = `\n\nCRITICAL SYSTEM INSTRUCTION: Write like a human and not like an AI. Do not use em dashes (—), overly complex vocabulary, or repetitive AI-like transitions (e.g., "Furthermore", "In conclusion", "It is important to note"). Sound natural and conversational.`;
    const finalPrompt = prompt + customInstructions;

    let retries = 3;
    let delay = 2000;
    let responseText = '';

    while (retries > 0) {
        try {
            if (isGroq) {
                if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing from environment');
                const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
                // Groq free tier has an 8000 TPM limit. "Requested" = prompt tokens + max_tokens.
                // We clamp max_tokens to 3000 (up from 1500) so deep eval can complete, but without hitting 8000 TPM.
                const safeMaxTokens = Math.min(maxTokens, 3000);
                const completion = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: finalPrompt }],
                    model: modelName,
                    temperature: temperature,
                    max_tokens: safeMaxTokens
                });
                responseText = completion.choices[0]?.message?.content || '';
            } else {
                if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing from environment');
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: { temperature, maxOutputTokens: maxTokens }
                });
                const result = await model.generateContent(finalPrompt);
                responseText = result.response.text();
            }
            break;
        } catch (error) {
            retries--;
            console.warn(`⚠️ AI API error (retries left: ${retries}):`, error.message);
            if (retries === 0) {
                console.error('❌ AI generation failed after all retries:', error.message);
                throw new Error(`AI generation failed: ${error.message}`);
            }
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
    return responseText;
}

// Helper function to initialize Excel file with headers if it doesn't exist
async function ensureExcelFile() {
    if (!fs.existsSync(FILE_PATH)) {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Jobs');
        
        // Add headers
        worksheet.columns = DEFAULT_HEADERS.map((header, index) => ({
            header: header,
            key: header.toLowerCase().replace(/\s+/g, '_'),
            width: 15
        }));
        
        // Style header row
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF366092' }
        };
        
        await workbook.xlsx.writeFile(FILE_PATH);
    }
}

// Helper function to get or create workbook
async function getWorkbook() {
    await ensureExcelFile();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(FILE_PATH);
    return workbook;
}

// ═════════════════════════════════════════════════════════════
// EVALUATE ENDPOINT HELPERS
// ═════════════════════════════════════════════════════════════

/**
 * Scrape visible text from a URL using Playwright
 */
async function scrapeJobPostingText(url) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        // Set a reasonable timeout
        page.setDefaultTimeout(10000);
        page.setDefaultNavigationTimeout(10000);
        
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        
        // Wait an extra 3 seconds to allow Single Page Applications (like Workday) to fetch and render job data
        await page.waitForTimeout(3000);
        
        // Extract visible text from body
        const bodyText = await page.evaluate(() => {
            const body = document.body;
            // Remove script and style tags
            Array.from(body.querySelectorAll('script, style, noscript')).forEach(el => el.remove());
            return body.innerText;
        });
        
        await browser.close();
        return bodyText.trim();
    } catch (error) {
        if (browser) await browser.close();
        throw new Error(`Failed to scrape URL: ${error.message}`);
    }
}

/**
 * Extract job metadata using Gemini
 */
async function extractJobMetadata(scrapedText, resumeProfile = 'sde', requestModel = null) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured in environment');
    }

    // Load CV, Profile, and other context from parent directory
    const ROOT = path.join(__dirname, '..');
    let cvContent = '';
    let profileContent = '';
    let userNarrative = '';
    let proofPoints = '';
    
    const profileMap = {
        'sde': 'cv-sde.md',
        'cloud-devops': 'cv-cloud-devops.md',
        'cybersec': 'cv-cybersec.md',
        'ai': 'cv-ai.md',
        'systems': 'cv-systems.md'
    };
    const cvFile = profileMap[resumeProfile] || 'cv-sde.md';

    try {
        cvContent = fs.readFileSync(path.join(ROOT, cvFile), 'utf-8');
        profileContent = fs.readFileSync(path.join(ROOT, 'config', 'profile.yml'), 'utf-8');
    } catch (e) {
        console.warn('Warning: Could not read CV or profile.', e.message);
    }

    try {
        if (fs.existsSync(path.join(ROOT, 'modes', '_profile.md'))) {
            userNarrative = fs.readFileSync(path.join(ROOT, 'modes', '_profile.md'), 'utf-8');
        }
        if (fs.existsSync(path.join(ROOT, 'article-digest.md'))) {
            proofPoints = fs.readFileSync(path.join(ROOT, 'article-digest.md'), 'utf-8');
        }
    } catch (e) {
        console.warn('Warning: Could not read _profile.md or article-digest.md.', e.message);
    }

    const prompt = `You are an expert career assistant evaluating a job posting against a candidate's CV and profile.
Do a deep evaluation mapping JD requirements to the candidate's experience.

CANDIDATE CV:
${cvContent || 'Not provided'}

CANDIDATE PROFILE (Config):
${profileContent || 'Not provided'}

CANDIDATE NARRATIVE & STRATEGY:
${userNarrative || 'Not provided'}

PROOF POINTS & METRICS:
${proofPoints || 'Not provided'}

JOB POSTING:
${scrapedText.slice(0, 8000)}

Evaluate the match between the candidate and the job posting.

Return a JSON object with EXACTLY these keys (no markdown, no code blocks):
{
  "company": "company name or 'Unknown'",
  "role": "job title or 'Unknown'",
  "req_id": "job ID/requisition ID if found, otherwise empty string",
  "archetype": "Detected role archetype (e.g. LLMOps, Agentic, PM, SA, FDE, Transformation, or Custom)",
  "match_score": "Evaluate the match out of 5 based on the CV. Return a number between 1.0 and 5.0 (e.g. 4.2)",
  "evaluation_summary": "A brief 2-sentence summary of why this is or isn't a good fit",
  "pros": ["array of 3 positive aspects of the role for this candidate"],
  "cons": ["array of 3 potential drawbacks or challenges for this candidate"],
  "key_requirements": [
    { "requirement": "JD requirement 1", "cv_evidence": "Exact evidence from CV/proof points" },
    { "requirement": "JD requirement 2", "cv_evidence": "Exact evidence from CV/proof points" }
  ],
  "gaps": [
    { "gap": "Missing skill/experience", "is_blocker": boolean, "mitigation": "How to mitigate this in a cover letter or interview" }
  ],
  "interview_angles": [
    { "concept": "Key theme from JD", "star_story_prompt": "Prompt for a STAR story the candidate should prepare based on their CV" }
  ],
  "resume_changes": [
    { "action": "Specific change to make to the CV (e.g. 'Reword the bullet about X to emphasize Y')", "reason": "Why this maximizes match with the JD" }
  ]
}

Return ONLY the JSON object, no other text.`;

    try {
        const responseText = await generateAIContent(prompt, requestModel, 0.0, 8192);

        // Clean up response (remove markdown code blocks if present)
        const jsonStr = responseText
            .replace(/^```json?\n?/, '')
            .replace(/\n?```$/, '')
            .trim();

        const metadata = JSON.parse(jsonStr);
        return {
            company: metadata.company || 'Unknown',
            role: metadata.role || 'Unknown',
            req_id: metadata.req_id || '',
            archetype: metadata.archetype || 'General',
            match_score: metadata.match_score || 0,
            evaluation_summary: metadata.evaluation_summary || '',
            pros: metadata.pros || [],
            cons: metadata.cons || [],
            key_requirements: metadata.key_requirements || [],
            gaps: metadata.gaps || [],
            interview_angles: metadata.interview_angles || [],
            resume_changes: metadata.resume_changes || []
        };
    } catch (error) {
        console.error('Gemini parsing error:', error.message);
        throw new Error(`Failed to parse metadata: ${error.message}`);
    }
}

/**
 * Extract job emails using Gemini
 */
async function extractJobEmails(scrapedText, resumeProfile = 'sde', requestModel = null) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured in environment');
    }

    // Load CV and Profile from parent directory
    const ROOT = path.join(__dirname, '..');
    const profileMap = {
        'sde': 'cv-sde.md',
        'cloud-devops': 'cv-cloud-devops.md',
        'cybersec': 'cv-cybersec.md',
        'ai': 'cv-ai.md',
        'systems': 'cv-systems.md'
    };
    const cvFileName = profileMap[resumeProfile] || 'cv-sde.md';

    let cvContent = '';
    let emailsContent = '';
    try {
        cvContent = fs.readFileSync(path.join(ROOT, cvFileName), 'utf-8');
        emailsContent = fs.readFileSync(path.join(ROOT, 'config', 'emails.json'), 'utf-8');
    } catch (e) {
        console.warn('Could not read CV or emails JSON', e.message);
    }

    const prompt = `You are an expert career assistant.
CANDIDATE CV:
${cvContent || 'Not provided'}

COLD EMAIL TEMPLATES & RESUME POINTS:
${emailsContent || 'Not provided'}

JOB POSTING:
${scrapedText.slice(0, 4000)}

Using the provided COLD EMAIL TEMPLATES & RESUME POINTS:
1. Select the most relevant resume point from "recruiter_resume_points" for the Recruiter email, and the most relevant from "manager_resume_points" for the Hiring Manager email.
2. Fill in the "recruiter_template" and "manager_template" by replacing [Req#], [Role Name] / [Role], [Req ID], [Company] / [Company Name], [domain], and your chosen [resume point] with appropriate values from the job posting and the selected resume point. Leave [Name] as is.
3. Return the generated emails using EXACTLY the following XML delimiters. Do not use JSON.

<RECRUITER_EMAIL>
Put the generated recruiter email here...
</RECRUITER_EMAIL>

<MANAGER_EMAIL>
Put the generated manager email here...
</MANAGER_EMAIL>`;

    try {
        const responseText = await generateAIContent(prompt, requestModel, 0.4, 4096);
        
        const recruiterMatch = responseText.match(/<RECRUITER_EMAIL>([\s\S]*?)<\/RECRUITER_EMAIL>/i);
        const managerMatch = responseText.match(/<MANAGER_EMAIL>([\s\S]*?)<\/MANAGER_EMAIL>/i);
        
        return {
            recruiter_email: recruiterMatch ? recruiterMatch[1].trim() : "",
            manager_email: managerMatch ? managerMatch[1].trim() : ""
        };
    } catch (error) {
        console.error('Email generation parse error:', error.message);
        throw error;
    }
}

/**
 * Search for recruiters at a company using a mock search
 */
async function searchForRecruiters(companyName) {
    try {
        const mockResults = [
            {
                title: `${companyName} Recruiter Jobs | LinkedIn`,
                body: `${companyName} is hiring recruiters and talent acquisition managers. Our recruiting team includes experienced professionals...`
            },
            {
                title: `${companyName} Talent Acquisition Leads`,
                body: `Looking for top talent acquisition leaders at ${companyName}. Meet our team of experienced hiring managers...`
            },
            {
                title: `${companyName} HR and Recruitment`,
                body: `${companyName}'s recruitment department manages hiring across all departments. Led by experienced recruiting professionals...`
            },
            {
                title: `${companyName} Hiring Managers Directory`,
                body: `${companyName} has a dedicated team of hiring managers and recruiters working in our talent acquisition department...`
            },
            {
                title: `Careers at ${companyName} | Our Team`,
                body: `Join ${companyName}'s recruiting team. Our talent acquisition and HR professionals are here to help you find your next opportunity...`
            }
        ];
        
        return mockResults;
    } catch (error) {
        console.warn(`Search preparation failed for ${companyName}:`, error.message);
        return [];
    }
}

/**
 * Extract recruiter info from search results using Gemini
 */
async function extractRecruiterInfo(companyName, searchSnippets, requestModel = null) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured in environment');
    }
    
    if (searchSnippets.length === 0) {
        return { recruiter_name: '', hiring_manager: '' };
    }
    
    const snippetText = searchSnippets
        .map((s, i) => `Result ${i + 1}:\nTitle: ${s.title}\nBody: ${s.body}`)
        .join('\n\n');
    
	const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
	const model = genAI.getGenerativeModel({ model: requestModel || GEMINI_MODEL });


    const prompt = `From these search results about ${companyName}, extract recruiter and hiring manager information. Return ONLY valid JSON (no markdown, no code blocks):

Search Results:
${snippetText}

Return JSON object with EXACTLY these keys:
{
  "recruiter_name": "name or empty string",
  "hiring_manager": "name or empty string"
}

Return ONLY the JSON object, no other text.`;

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        
        // Clean up response (remove markdown code blocks if present)
        const jsonStr = responseText
            .replace(/^```json?\n?/, '')
            .replace(/\n?```$/, '')
            .trim();
        
        const info = JSON.parse(jsonStr);
        return {
            recruiter_name: info.recruiter_name || '',
            hiring_manager: info.hiring_manager || ''
        };
    } catch (error) {
        console.warn('Recruiter extraction error:', error.message);
        return { recruiter_name: '', hiring_manager: '' };
    }
}

// ═════════════════════════════════════════════════════════════
// GMAIL API ENDPOINTS
// ═════════════════════════════════════════════════════════════

app.get('/api/gmail/status', (req, res) => {
    const isConnected = fs.existsSync(TOKEN_PATH) && oauth2Client.credentials && oauth2Client.credentials.access_token;
    res.json({ connected: !!isConnected });
});

app.get('/api/gmail/auth', (req, res) => {
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
        return res.status(500).json({ error: 'GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET not set in .env' });
    }
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.compose'],
        prompt: 'consent'
    });
    res.redirect(authUrl);
});

app.get('/api/gmail/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('No code provided');
    }
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        if (!fs.existsSync(path.join(__dirname, 'config'))) {
            fs.mkdirSync(path.join(__dirname, 'config'));
        }
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        res.send('<html><body><h2>Authentication successful!</h2><p>You can close this window and return to the app.</p><script>window.close();</script></body></html>');
    } catch (error) {
        console.error('Error retrieving access token', error);
        res.status(500).send('Error retrieving access token');
    }
});

app.post('/api/gmail/draft', async (req, res) => {
    try {
        const { to, subject, body } = req.body;
        if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
            return res.status(401).json({ success: false, error: 'Not authenticated with Gmail' });
        }
        
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Parse markdown body to HTML to make links clickable, preserving single line breaks
        const htmlBody = marked.parse(body || '', { breaks: true });

        // Use nodemailer to easily build RFC 2822 message
        const mail = new MailComposer({
            to: to || 'recruiter@example.com',
            subject: subject,
            text: body,
            html: htmlBody,
            textEncoding: 'base64'
        });
        
        const message = await mail.compile().build();
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
            
        const draft = await gmail.users.drafts.create({
            userId: 'me',
            requestBody: {
                message: {
                    raw: encodedMessage
                }
            }
        });
        
        res.json({ success: true, draftId: draft.data.id });
    } catch (error) {
        console.error('Draft creation error:', error);
        res.status(500).json({ success: false, error: 'Failed to create draft', details: error.message });
    }
});

// GET /api/jobs - Read Excel and return rows as JSON
app.get('/api/jobs', async (req, res) => {
    try {
        await ensureExcelFile();
        
        const workbook = await getWorkbook();
        const worksheet = workbook.getWorksheet('Jobs') || workbook.getWorksheet(1);
        
        if (!worksheet) {
            return res.status(500).json({
                success: false,
                error: 'Jobs worksheet not found'
            });
        }
        
        const jobs = [];
        const headers = [];
        
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                // Extract headers from first row
                row.eachCell((cell, colNumber) => {
                    headers[colNumber] = cell.value;
                });
            } else {
                // Convert each data row to an object using headers
                const job = {};
                row.eachCell((cell, colNumber) => {
                    if (headers[colNumber]) {
                        job[headers[colNumber]] = cell.value;
                    }
                });
                if (Object.keys(job).length > 0) {
                    jobs.push(job);
                }
            }
        });
        
        res.json({
            success: true,
            count: jobs.length,
            data: jobs
        });
    } catch (error) {
        console.error('Error reading Excel file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read applications data.',
            details: error.message
        });
    }
});

// POST /api/jobs - Append structured JSON data to the Excel sheet
app.post('/api/jobs', async (req, res) => {
    try {
        const newJob = req.body;
        
        // Validate that we have at least company and role
        if (!newJob || !newJob.Company || !(newJob.Role || newJob['Job Role'])) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields. Please provide at least "Company" and "Role" or "Job Role".',
                receivedData: newJob
            });
        }
        
        await ensureExcelFile();
        const workbook = await getWorkbook();
        const worksheet = workbook.getWorksheet('Jobs') || workbook.getWorksheet(1);
        
        if (!worksheet) {
            return res.status(500).json({
                success: false,
                error: 'Jobs worksheet not found'
            });
        }
        
        // Get headers from first row
        const headers = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value;
        });
        
        // If no headers exist, initialize with default headers
        if (headers.filter(h => h).length === 0) {
            worksheet.getRow(1).values = DEFAULT_HEADERS;
            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF366092' }
            };
            DEFAULT_HEADERS.forEach((h, i) => {
                headers[i + 1] = h;
            });
        }
        
        // Dynamically add any missing headers from newJob
        Object.keys(newJob).forEach(key => {
            if (!headers.includes(key)) {
                let maxCol = 0;
                headers.forEach((h, idx) => { if (h) maxCol = Math.max(maxCol, idx); });
                const nextCol = maxCol + 1;
                headers[nextCol] = key;
                
                const headerCell = worksheet.getRow(1).getCell(nextCol);
                headerCell.value = key;
                headerCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                headerCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF366092' }
                };
                worksheet.getColumn(nextCol).width = 15;
            }
        });
        
        // Check for duplicate based on Job Link and Resume Profile
        const jobLinkIndex = headers.indexOf('Job Link');
        const resumeProfileIndex = headers.indexOf('Resume Profile');
        
        let isDuplicate = false;
        let existingRowNumber = -1;
        
        if (jobLinkIndex !== -1) {
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header
                const linkValue = row.getCell(jobLinkIndex).value;
                const profileValue = resumeProfileIndex !== -1 ? row.getCell(resumeProfileIndex).value : undefined;
                
                // Compare with current job
                const currentLink = newJob['Job Link'];
                const currentProfile = newJob['Resume Profile'] || 'sde';
                
                if (linkValue === currentLink) {
                    if (resumeProfileIndex === -1 || !profileValue || profileValue === currentProfile) {
                        isDuplicate = true;
                        existingRowNumber = rowNumber;
                    }
                }
            });
        }
        
        if (isDuplicate) {
            // Overwrite existing row
            const rowToUpdate = worksheet.getRow(existingRowNumber);
            headers.forEach((header, index) => {
                if (header) {
                    // Update value if present in newJob
                    if (newJob[header] !== undefined) {
                        rowToUpdate.getCell(index).value = newJob[header] || '';
                    }
                }
            });
            rowToUpdate.commit();
        } else {
            // Construct the row array using the header keys
            const rowToAdd = [];
            headers.forEach((header, index) => {
                if (header) {
                    rowToAdd[index - 1] = newJob[header] || '';
                }
            });
            
            // Add default date if not provided
            if (!newJob.Date) {
                const dateIndex = headers.indexOf('Date');
                if (dateIndex >= 0) {
                    rowToAdd[dateIndex - 1] = new Date().toISOString().split('T')[0];
                }
            }
            
            worksheet.addRow(rowToAdd);
        }
        
        await workbook.xlsx.writeFile(FILE_PATH);
        
        res.status(201).json({
            success: true,
            message: 'Job added successfully',
            data: newJob
        });
    } catch (error) {
        console.error('Error writing to Excel file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save application data.',
            details: error.message
        });
    }
});

// POST /api/jobs/evaluate - Evaluate a job URL using AI
app.post('/api/jobs/evaluate', async (req, res) => {
    try {
        const { url, text, resumeProfile, model } = req.body;
        
        if (!url || typeof url !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid "url" field'
            });
        }
        
        if (!GEMINI_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Server not configured: GEMINI_API_KEY missing',
                hint: 'Add GEMINI_API_KEY to .env file'
            });
        }
        
        console.log(`\n🔍 Evaluating: ${url}`);
        
        // Step 1: Scrape the job posting or use raw text
        let scrapedText = text || '';
        if (!scrapedText || scrapedText.trim().length < 50) {
            console.log('📄 Scraping job posting...');
            scrapedText = await scrapeJobPostingText(url);
        } else {
            console.log('📄 Using provided raw job description text...');
        }
        
        if (scrapedText.length < 50) {
            return res.status(400).json({
                success: false,
                error: 'URL did not contain enough text to analyze',
                details: 'The page may be behind login or not a job posting. Please paste the raw job description text.'
            });
        }
        
        // Step 2: Extract job metadata
        console.log(`🤖 Extracting job info with Gemini using profile: ${resumeProfile || 'sde'}...`);
        const jobMetadata = await extractJobMetadata(scrapedText, resumeProfile, model);
        
        // Step 3: Merge all data
        const evaluatedJob = {
            'Company': jobMetadata.company,
            'Job Role': jobMetadata.role,
            'Score': jobMetadata.match_score || '',
            'Status': 'Evaluated',
            'Resume Profile': resumeProfile || 'sde',
            'Job Link': url,
            'Job ID': jobMetadata.req_id,
            'Recruiter URL': '',
            'Hiring Manager URL': '',
            'Job Description': scrapedText
        };
        
        const evaluationReport = {
            match_score: jobMetadata.match_score,
            evaluation_summary: jobMetadata.evaluation_summary,
            archetype: jobMetadata.archetype || '',
            pros: jobMetadata.pros || [],
            cons: jobMetadata.cons || [],
            key_requirements: jobMetadata.key_requirements || [],
            gaps: jobMetadata.gaps || [],
            interview_angles: jobMetadata.interview_angles || [],
            resume_changes: jobMetadata.resume_changes || [],
            recruiter_email: jobMetadata.recruiter_email || '',
            manager_email: jobMetadata.manager_email || ''
        };
        
        console.log('✅ Job evaluation complete!\n');
        
        res.status(200).json({
            success: true,
            message: 'Job evaluated successfully',
            data: evaluatedJob,
            report: evaluationReport
        });
        
    } catch (error) {
        console.error('❌ Evaluation error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Job evaluation failed',
            details: error.message
        });
    }
});

// POST /api/jobs/contacts - Find Contacts for a Company
app.post('/api/jobs/contacts', async (req, res) => {
    try {
        const { company, url, text, model } = req.body;
        if (!company) {
            return res.status(400).json({ success: false, error: 'Missing company name' });
        }
        
        console.log(`\n🔎 Fetching contact data and predicting email format for ${company}...`);
        
        const recruiterQuery = `${company} AND ("Technical Recruiter" OR "Talent Acquisition" OR "Recruiting" OR "university recruiter")`;
        const managerQuery = `${company} AND ("Engineering Manager" OR "Software Engineering Manager" OR "Director of Software Engineering")`;
        
        const recruiterSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(recruiterQuery)}&geoUrn=%5B"103644278"%5D`;
        const managerSearchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(managerQuery)}&geoUrn=%5B"103644278"%5D`;

        // Scrape job text if not provided
        let jobText = text || '';
        if ((!jobText || jobText.trim().length < 50) && url) {
            jobText = await scrapeJobPostingText(url);
        }

        let emailFormat = 'Could not determine';
        if (jobText && jobText.length >= 50) {
            console.log(`🤖 Predicting email format for ${company} using AI...`);
            const prompt = `You are an expert technical recruiter and OSINT specialist.
Your task is to predict the single most likely corporate email format used by employees at the company "${company}".

Analyze the following job description (or parts of the company website page) to see if any real email addresses or domain names are mentioned:
${jobText.slice(0, 8000)}

Based on the company name "${company}" and any domain clues found in the text above, determine the likely corporate email format (e.g., first.last@company.com, flast@company.com, first@company.com, firstlast@company.com).
If the job text contains an actual email address, base your format on that.

Return a JSON object with exactly this key:
{
  "emailFormat": "Predicted format, e.g. first.last@company.com"
}
Return ONLY valid JSON without markdown formatting.`;

            try {
                const responseText = await generateAIContent(prompt, model, 0.3, 1000);
                let generatedJsonStr = responseText.trim();
                if (generatedJsonStr.startsWith('```json')) {
                    generatedJsonStr = generatedJsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
                }
                const parsed = JSON.parse(generatedJsonStr);
                if (parsed.emailFormat) {
                    emailFormat = parsed.emailFormat;
                }
            } catch (aiErr) {
                console.warn('⚠️ Failed to predict email format:', aiErr.message);
            }
        }
        
        res.status(200).json({
            success: true,
            recruiterUrl: recruiterSearchUrl,
            managerUrl: managerSearchUrl,
            emailFormat: emailFormat
        });
    } catch (error) {
        console.error('❌ Contacts error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to generate contacts',
            details: error.message
        });
    }
});

// POST /api/jobs/chat - Ask AI a question about the job
app.post('/api/jobs/chat', async (req, res) => {
    try {
        const { question, url, text, resumeProfile, model } = req.body;
        if (!question) {
            return res.status(400).json({ success: false, error: 'Missing question' });
        }

        let jobText = text || '';
        if ((!jobText || jobText.trim().length < 50) && url) {
            jobText = await scrapeJobPostingText(url);
        }

        // Load CV
        const ROOT = path.join(__dirname, '..');
        const profileMap = {
            'sde': 'cv-sde.md',
            'cloud-devops': 'cv-cloud-devops.md',
            'cybersec': 'cv-cybersec.md',
            'ai': 'cv-ai.md',
            'systems': 'cv-systems.md'
        };
        const cvFile = profileMap[resumeProfile] || 'cv-sde.md';
        const cvPath = path.join(ROOT, cvFile);
        let cvContent = '';
        if (fs.existsSync(cvPath)) {
            cvContent = fs.readFileSync(cvPath, 'utf8');
        }

        const prompt = `You are an expert career coach and technical mentor. 
Your client is applying for a job and has asked you a specific question or requested help writing a short response for their job application.

Here is the Job Description:
---
${jobText.slice(0, 8000)}
---

Here is the client's Resume/Profile:
---
${cvContent.slice(0, 4000)}
---

Client's Request: "${question}"

Provide a highly tailored, intelligent, and concise response to the client's request. If they are asking for a short essay or answer to an application question (e.g., "Why do you want to join us?"), write it in a professional, human-sounding tone, explicitly connecting their resume experience to the job description requirements. DO NOT use markdown code blocks, just return the text.`;

        const responseText = await generateAIContent(prompt, model, 0.7, 1500);

        res.status(200).json({
            success: true,
            answer: responseText.trim()
        });
    } catch (error) {
        console.error('❌ Chat error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to generate answer',
            details: error.message
        });
    }
});

// POST /api/jobs/generate-emails - Generate emails after evaluation
app.post('/api/jobs/generate-emails', async (req, res) => {
    try {
        const { url, text, resumeProfile, model } = req.body;
        
        let jobText = text || '';
        if (!jobText || jobText.trim().length < 50) {
            jobText = await scrapeJobPostingText(url);
        }

        const emails = await extractJobEmails(jobText, resumeProfile, model);

        res.status(200).json({
            success: true,
            recruiter_email: emails.recruiter_email || '',
            manager_email: emails.manager_email || ''
        });
    } catch (error) {
        console.error('Email generation error:', error.message);
        res.status(500).json({ success: false, error: 'Email generation failed', details: error.message });
    }
});
// POST /api/contacto - Generate LinkedIn Outreach Message
app.post('/api/contacto', async (req, res) => {
    try {
        const { outreachDetails, resumeProfile, model: requestModel } = req.body;
        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
        
        const ROOT = path.join(__dirname, '..');
        
        // Resolve the correct CV profile
        const profileMap = {
            'sde': 'cv-sde.md',
            'cloud-devops': 'cv-cloud-devops.md',
            'cybersec': 'cv-cybersec.md',
            'ai': 'cv-ai.md',
            'systems': 'cv-systems.md'
        };
        const cvFileName = profileMap[resumeProfile] || 'cv-sde.md';

        // 1. Read context files
        let cvContent = '';
        try {
            cvContent = fs.readFileSync(path.join(ROOT, cvFileName), 'utf-8');
        } catch (e) {
            console.warn(`${cvFileName} not found, falling back to cv.md`);
            try {
                cvContent = fs.readFileSync(path.join(ROOT, 'cv.md'), 'utf-8');
            } catch (fallbackErr) {
                console.warn('cv.md not found');
            }
        }

        let emailsContent = '';
        try {
            emailsContent = fs.readFileSync(path.join(ROOT, 'config', 'emails.json'), 'utf-8');
        } catch (e) {
            console.warn('emails.json not found');
        }
        
        
        
        const prompt = `You are an expert career coach helping a candidate write outreach messages.

CANDIDATE CV:
${cvContent}

EMAIL TEMPLATES AND RESUME POINTS:
${emailsContent}

TARGET CONTEXT AND INSTRUCTIONS:
${outreachDetails || 'Not provided'}

TASK:
Write outreach messages based on the TARGET CONTEXT AND INSTRUCTIONS provided above.

You must output TWO separate messages, formatted clearly in Markdown:

### 1. LinkedIn Connection Request
A highly concise message (strictly under 300 characters). 
Must follow a conversational, human structure:
1. A polite greeting.
2. Mention the specific role you are applying/interested in (if provided in context).
3. Include a very brief 1-sentence hook about your background that makes you a fit.
4. A polite closing to connect.
Do not sound like a robot listing skills. Sound like a polite professional.

### 2. Formal Email Outreach
Using the provided EMAIL TEMPLATES AND RESUME POINTS (from emails.json), pick the MOST relevant domain/resume point based on the TARGET CONTEXT and fill out one of the templates (either recruiter or manager). 
Ensure the final email reads naturally and seamlessly integrates the chosen resume point. Do not leave any [brackets] unfilled.
CRITICAL: You MUST preserve the exact paragraph structure and line breaks from the template. Use double newlines (\n\n) for every line break so that the Markdown renderer displays the paragraphs correctly.
`;
        
        const responseText = await generateAIContent(prompt, requestModel, 0.3, 4096);
        res.json({ success: true, message: responseText.trim() });
    } catch (error) {
        console.error('Error generating outreach:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/cover - Generate Cover Letter PDF
app.post('/api/cover', async (req, res) => {
    try {
        const { jobUrl, jobText, resumeProfile, model: requestModel } = req.body;
        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
        if (!jobUrl) throw new Error('Job URL is required');

        // 1. Scrape the URL or use raw text
        let scrapedText = jobText || '';
        if (!scrapedText || scrapedText.trim().length < 50) {
            scrapedText = await scrapeJobPostingText(jobUrl);
        }
        if (scrapedText.length < 50) {
            throw new Error('Not enough text to analyze. The page may be behind a login. Please paste the raw job description.');
        }

        // 2. Read context files
        const ROOT = path.join(__dirname, '..');
        const profileMap = {
            'sde': 'cv-sde.md',
            'cloud-devops': 'cv-cloud-devops.md',
            'cybersec': 'cv-cybersec.md',
            'ai': 'cv-ai.md',
            'systems': 'cv-systems.md'
        };
        const cvFile = profileMap[resumeProfile] || 'cv-sde.md';
        
        let cvContent = '';
        try {
            cvContent = fs.readFileSync(path.join(ROOT, cvFile), 'utf-8');
        } catch (e) {
            cvContent = fs.readFileSync(path.join(ROOT, 'cv.md'), 'utf-8');
        }
        
        const profileContent = fs.readFileSync(path.join(ROOT, 'config', 'profile.yml'), 'utf-8');

        // 3. Ask Gemini to generate JSON payload
        
        
        const prompt = `Act as an expert career coach and a talented copywriter who specializes in writing authentic, human-sounding cover letters for the tech industry. 
Your goal is to write a tailored cover letter for this specific role.

CANDIDATE CV (Source of truth for background):
${cvContent}

CANDIDATE PROFILE (Contact Info):
${profileContent}

JOB POSTING:
${scrapedText.slice(0, 8000)}

MASTER TEMPLATE TEXT:
"""
When I saw [Company Name]'s opening for a [Job Title], it felt like a perfect match for my background. I recently finished my Master’s in Computer Science at UT Dallas, and I am really excited about the opportunity to bring my hands-on experience to your team. Based on your mission to [Paraphrase Company Mission or Core Project Goal], I am confident I can step in and help the team succeed from day one.

I focus on building software that solves real-world problems and delivers clear results. Over the last few years, I built CI/CD pipelines that development teams relied on every day, automated workflows that saved hours of manual effort per reporting cycle, and worked on [Key achievement, e.g., low-level kernel networking filters / enterprise AI benchmarks]. I prefer focusing on real engineering and business impact, such as boosting system efficiency or improving user experience, rather than just checking off tasks.

On the technical side, my core stack includes [List Core Tech Stack, e.g., AWS/Azure, .NET, C++]. Beyond writing code, I have extensive experience working in fast-paced environments alongside cross-functional teams. I am the type of engineer who writes clear documentation without being asked, collaborates easily with other developers and product managers, and knows how to explain complex technical trade-offs in simple, everyday terms.

I would love the chance to discuss my qualifications further and learn more about your company's upcoming technical goals. Thank you so much for your time and consideration.
"""

Here are the strict rules you MUST follow:
- KEEP THE EXACT FORMAT AND STRUCTURE: You MUST use the MASTER TEMPLATE TEXT above completely verbatim. DO NOT write a new cover letter. Do not re-write my sentences.
- FILL IN THE BLANKS: ONLY replace the bracketed sections (e.g. [Company Name], [Job Title], [Key achievement...]) with tailored information based on my CV and the Job Posting.
- NO AI BUZZWORDS OR FLUFF: Absolutely ban corporate cliché phrases.
- ENGINEERING FOCUS: Keep the technical achievements focused on real engineering and business impact.
- KEEP IT CONCISE: Do not add extra paragraphs.

Generate a JSON object matching this schema exactly:
{
  "candidate": {
    "name": "Candidate Name",
    "location": "City, State",
    "email": "email",
    "phone": "phone"
  },
  "recipient": {
    "title": "Hiring Manager",
    "company": "Company Name",
    "location": "Company City, State (or Remote)"
  },
  "letter": {
    "greeting": "Dear Hiring Manager,",
    "paragraphs": [
      "Paragraph 1 text...",
      "Paragraph 2 text...",
      "Paragraph 3 text...",
      "Paragraph 4 text..."
    ],
    "closing": "Sincerely,"
  }
}

Return ONLY valid JSON without markdown formatting.`;

        const responseText = await generateAIContent(prompt, requestModel, 0.3, 4096);
        let generatedJsonStr = responseText.trim();
        if (generatedJsonStr.startsWith('```json')) {
            generatedJsonStr = generatedJsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        }
        
        const payloadObj = JSON.parse(generatedJsonStr);

        // 4. Save JSON to temp file
        const timestamp = Date.now();
        const jsonFile = path.join(ROOT, 'output', `payload-${timestamp}.json`);
        const pdfFile = path.join(ROOT, 'output', `cover-tailored-${timestamp}.pdf`);
        
        if (!fs.existsSync(path.join(ROOT, 'output'))) {
            fs.mkdirSync(path.join(ROOT, 'output'));
        }
        
        fs.writeFileSync(jsonFile, JSON.stringify(payloadObj, null, 2), 'utf-8');

        // 5. Execute generate-cover-letter.mjs
        const scriptPath = path.join(ROOT, 'generate-cover-letter.mjs');
        await execPromise(`node "${scriptPath}" --payload "${jsonFile}" --out "${pdfFile}"`, { cwd: ROOT });

        // Clean up temp JSON
        try {
            fs.unlinkSync(jsonFile);
        } catch (e) {
            console.error('Failed to cleanup temp JSON file:', e);
        }

        res.json({ 
            success: true, 
            message: 'Cover Letter PDF generated successfully.',
            downloadUrl: `http://localhost:${PORT}/output/cover-tailored-${timestamp}.pdf`
        });
    } catch (error) {
        console.error('Cover Letter Generation Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/deep - Deep Company Research
app.post('/api/deep', async (req, res) => {
    try {
        const { company, model: requestModel } = req.body;
        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
        
        
        
        const prompt = `Provide a deep research brief based on the following request or company name: 
"${company}"

Include the following sections where applicable:
1. Core business & product
2. Recent news or milestones
3. Tech stack (if known)
4. Competitors
5. Culture/Values. Format as clean Markdown.`;
        
        const responseText = await generateAIContent(prompt, requestModel, 0.3, 4096);
        res.json({ success: true, research: responseText.trim() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/pdf - Generate ATS CV
app.post('/api/pdf', async (req, res) => {
    try {
        const { jobUrl, jobText, resumeProfile, format, model: requestModel } = req.body;
        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
        if (!jobUrl) throw new Error('Job URL is required');

        // 1. Scrape the URL or use raw text
        let scrapedText = jobText || '';
        if (!scrapedText || scrapedText.trim().length < 50) {
            scrapedText = await scrapeJobPostingText(jobUrl);
        }
        if (scrapedText.length < 50) {
            throw new Error('Not enough text to analyze. The page may be behind a login. Please paste the raw job description.');
        }

        // 2. Read context files
        const ROOT = path.join(__dirname, '..');
        const profileMap = {
            'sde': 'cv-sde.md',
            'cloud-devops': 'cv-cloud-devops.md',
            'cybersec': 'cv-cybersec.md',
            'ai': 'cv-ai.md',
            'systems': 'cv-systems.md'
        };
        const cvFile = profileMap[resumeProfile] || 'cv-sde.md';
        
        let cvContent = '';
        try {
            cvContent = fs.readFileSync(path.join(ROOT, cvFile), 'utf-8');
        } catch (e) {
            // Fallback to cv.md if specific profile doesn't exist yet
            cvContent = fs.readFileSync(path.join(ROOT, 'cv.md'), 'utf-8');
        }
        
        const profileContent = fs.readFileSync(path.join(ROOT, 'config', 'profile.yml'), 'utf-8');
        const cvTemplate = fs.readFileSync(path.join(ROOT, 'templates', 'cv-template.html'), 'utf-8');

        // 3. Ask Gemini to generate HTML
        
        
        const prompt = `You are an expert career assistant. You must generate an ATS-optimized CV in HTML format.
        
CANDIDATE CV (Source of truth):
${cvContent}

CANDIDATE PROFILE:
${profileContent}

HTML TEMPLATE:
${cvTemplate}

JOB POSTING:
${scrapedText.slice(0, 8000)}

INSTRUCTIONS:
1. Tailor the Professional Summary and Work Experience bullets to emphasize skills relevant to the JOB POSTING, without inventing any fake experience.
2. Replace all {{...}} placeholders in the HTML TEMPLATE with the tailored content. Specifically:
   - {{LANG}}: en
   - {{PAGE_WIDTH}}: ${format === 'letter' ? '8.5in' : '210mm'}
   - {{NAME}}, {{PHONE}}, {{EMAIL}}, {{LINKEDIN_URL}}, {{LINKEDIN_DISPLAY}}, {{PORTFOLIO_URL}}, {{PORTFOLIO_DISPLAY}}, {{LOCATION}} from CANDIDATE PROFILE.
   - {{SECTION_SUMMARY}}: Professional Summary
   - {{SUMMARY_TEXT}}: Your tailored summary.
   - {{SECTION_COMPETENCIES}}: Core Competencies
   - {{COMPETENCIES}}: HTML snippet of 6-8 key skills like <span class="competency-tag">Skill</span>
   - {{SECTION_EXPERIENCE}}: Work Experience
   - {{EXPERIENCE}}: HTML for jobs
   - {{SECTION_PROJECTS}}: Projects
   - {{PROJECTS}}: HTML for top projects
   - {{SECTION_EDUCATION}}: Education
   - {{EDUCATION}}: HTML for education
   - {{SECTION_CERTIFICATIONS}}: Certifications
   - {{CERTIFICATIONS}}: HTML for certifications
   - {{SECTION_SKILLS}}: Skills
   - {{SKILLS}}: HTML for skills
3. Your output MUST be ONLY valid, raw HTML. Do not wrap it in markdown code blocks. Start directly with <!DOCTYPE html> or <html>.`;

        const responseText = await generateAIContent(prompt, requestModel, 0.3, 4096);
        let generatedHtml = responseText.trim();
        if (generatedHtml.startsWith('```html')) {
            generatedHtml = generatedHtml.replace(/^```html\n?/, '').replace(/\n?```$/, '');
        }

        // 4. Save HTML to temp file
        const timestamp = Date.now();
        const htmlFile = path.join(ROOT, 'output', `temp-${timestamp}.html`);
        const pdfFile = path.join(ROOT, 'output', `cv-tailored-${timestamp}.pdf`);
        
        if (!fs.existsSync(path.join(ROOT, 'output'))) {
            fs.mkdirSync(path.join(ROOT, 'output'));
        }
        
        fs.writeFileSync(htmlFile, generatedHtml, 'utf-8');

        // 5. Execute generate-pdf.mjs
        const scriptPath = path.join(ROOT, 'generate-pdf.mjs');
        await execPromise(`node "${scriptPath}" "${htmlFile}" "${pdfFile}" --format=${format}`, { cwd: ROOT });

        // Clean up temp HTML
        try {
            fs.unlinkSync(htmlFile);
        } catch (e) {
            console.error('Failed to cleanup temp HTML file:', e);
        }

        res.json({ 
            success: true, 
            message: `ATS-optimized PDF generated successfully in ${format} format.`,
            downloadUrl: `http://localhost:${PORT}/output/cv-tailored-${timestamp}.pdf`
        });
    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        message: 'Server is running',
        excelFile: FILE_PATH,
        excelExists: fs.existsSync(FILE_PATH)
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Career Ops - Jobs API Server',
        version: '2.0.0',
        endpoints: {
            'GET /api/jobs': 'Retrieve all jobs from Excel',
            'POST /api/jobs': 'Add a new job to Excel',
            'POST /api/jobs/evaluate': 'Evaluate a job URL (requires GEMINI_API_KEY)',
            'GET /api/health': 'Server health check'
        },
        corsOrigin: 'http://localhost:5173'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server running at http://0.0.0.0:${PORT}`);
    console.log(`✅ CORS enabled for http://localhost:5173`);
    console.log(`📄 Excel file: ${FILE_PATH}`);
    console.log(`🤖 Gemini API: ${GEMINI_API_KEY ? '✅ Configured' : '⚠️  Not configured'}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  http://localhost:${PORT}/api/jobs`);
    console.log(`  POST http://localhost:${PORT}/api/jobs`);
    console.log(`  POST http://localhost:${PORT}/api/jobs/evaluate (requires GEMINI_API_KEY)`);
    console.log(`  GET  http://localhost:${PORT}/api/health\n`);
});
