import React, { useState, useEffect } from 'react';
import { 
  Rocket, 
  Sparkles, 
  Search, 
  AlertCircle, 
  Briefcase, 
  Building2, 
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  FileText,
  MessageSquare,
  BarChart,
  LayoutDashboard,
  Target,
  Send,
  Download,
  BookOpen,
  Menu,
  Link as LinkIcon
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { 
  fetchJobs, 
  evaluateJobWithAI, 
  addJob,
  generateContacto,
  generateCover,
  generateDeep,
  generatePdf,
  generateEmails,
  findContacts,
  askAIChat
} from '../services/api';
import './Dashboard.css';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('tracker');
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState('gemini-flash-latest');
  // Evaluator State
  const [aiUrl, setAiUrl] = useState('');
  const [aiText, setAiText] = useState('');
  const [resumeProfile, setResumeProfile] = useState('sde');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isGeneratingEmails, setIsGeneratingEmails] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [isFindingContacts, setIsFindingContacts] = useState(false);
  const [contactsResult, setContactsResult] = useState(null);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatResult, setChatResult] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Custom URL Overrides State
  const [chosenRecruiterUrl, setChosenRecruiterUrl] = useState('');
  const [chosenManagerUrl, setChosenManagerUrl] = useState('');

  // Outreach & Research State
  const [contactoData, setContactoData] = useState({ outreachDetails: '', resumeProfile: 'sde' });
  const [contactoResult, setContactoResult] = useState(null);
  const [isContactoLoading, setIsContactoLoading] = useState(false);
  
  const [deepData, setDeepData] = useState({ company: '' });
  const [deepResult, setDeepResult] = useState(null);
  const [isDeepLoading, setIsDeepLoading] = useState(false);

  // CV & Cover Letter State
  const [pdfData, setPdfData] = useState({ jobUrl: '', jobText: '', resumeProfile: 'sde', format: 'letter' });
  const [pdfResult, setPdfResult] = useState(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const [coverData, setCoverData] = useState({ jobUrl: '', jobText: '', resumeProfile: 'sde' });
  const [coverResult, setCoverResult] = useState(null);
  const [isCoverLoading, setIsCoverLoading] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const data = await fetchJobs();
      setJobs(data);
    } catch (err) {
      setError('Failed to load jobs from the server.');
    }
  };

  const copyRichText = (elementId) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
  };

  const handleAIEvaluate = async (e) => {
    e.preventDefault();
    if (!aiUrl) return;
    
    setIsEvaluating(true);
    setError(null);
    setEvaluationResult(null);
    setContactsResult(null);
    setChatInput('');
    setChatResult('');
    setChosenRecruiterUrl('');
    setChosenManagerUrl('');
    try {
      const res = await evaluateJobWithAI(aiUrl, aiText, resumeProfile, selectedModel);
      setEvaluationResult(res);
      
      // Auto-save the evaluated job to the tracker with raw JSON
      if (res && res.data) {
        res.data['Raw_Report_JSON'] = JSON.stringify(res.report);
        await addJob(res.data);
        await loadJobs();
      }
    } catch (err) {
      setError(err.message || 'AI Evaluation failed.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleApplyToTracker = async () => {
    if (!evaluationResult || !evaluationResult.data) return;
    try {
      const jobData = { 
        ...evaluationResult.data, 
        Status: 'Applied',
        'Date Applied': evaluationResult.data['Date Applied'] || new Date().toISOString().split('T')[0]
      };
      
      if (contactsResult) {
        jobData['Recruiter URL'] = contactsResult.recruiterUrl;
        jobData['Hiring Manager URL'] = contactsResult.managerUrl;
      }
      
      if (chosenRecruiterUrl) jobData['Chosen Recruiter URL'] = chosenRecruiterUrl;
      if (chosenManagerUrl) jobData['Chosen Manager URL'] = chosenManagerUrl;
      
      await addJob(jobData);
      setEvaluationResult(null);
      setContactsResult(null);
      await loadJobs();
      setActiveTab('tracker');
    } catch (err) {
      setError('Failed to add job to tracker: ' + err.message);
    }
  };

  const handleGenerateEmails = async () => {
    if (!evaluationResult) return;
    setIsGeneratingEmails(true);
    setError(null);
    try {
      const res = await generateEmails(aiUrl, aiText, resumeProfile, selectedModel);
      
      const updatedReport = {
        ...evaluationResult.report,
        recruiter_email: res.recruiter_email,
        manager_email: res.manager_email
      };
      
      const updatedData = {
        ...evaluationResult.data,
        Raw_Report_JSON: JSON.stringify(updatedReport)
      };

      setEvaluationResult({
        data: updatedData,
        report: updatedReport
      });
      
      // Auto-save the newly generated emails back      // Auto-save
      await addJob(updatedData);
      await loadJobs();
    } catch (err) {
      setError('Failed to generate emails: ' + err.message);
    } finally {
      setIsGeneratingEmails(false);
    }
  };

  const handleFindContacts = async () => {
    if (!evaluationResult || !evaluationResult.data || !evaluationResult.data.Company) return;
    setIsFindingContacts(true);
    setError(null);
    try {
      const res = await findContacts(evaluationResult.data.Company, aiUrl, aiText, selectedModel);
      setContactsResult({
        recruiterUrl: res.recruiterUrl,
        managerUrl: res.managerUrl,
        emailFormat: res.emailFormat
      });
    } catch (err) {
      setError('Failed to find contacts: ' + err.message);
    } finally {
      setIsFindingContacts(false);
    }
  };

  const handleAskChat = async () => {
    if (!chatInput.trim() || !evaluationResult) return;
    setIsChatLoading(true);
    setError(null);
    try {
      const res = await askAIChat(chatInput, aiUrl, aiText, resumeProfile, selectedModel);
      setChatResult(res.answer);
    } catch (err) {
      setError('Failed to get answer: ' + err.message);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleStatusChange = async (e, job) => {
    e.stopPropagation();
    const newStatus = e.target.value;
    
    // Optimistic update
    const updatedJobs = jobs.map(j => 
      j['Job Link'] === job['Job Link'] && j['Resume Profile'] === job['Resume Profile'] 
        ? { ...j, Status: newStatus } 
        : j
    );
    setJobs(updatedJobs);

    try {
      await addJob({ ...job, Status: newStatus });
      await loadJobs();
    } catch (err) {
      setError('Failed to update status: ' + err.message);
      await loadJobs();
    }
  };

  const handleRowClick = (job) => {
    if (job.Raw_Report_JSON) {
      try {
        const report = JSON.parse(job.Raw_Report_JSON);
        setEvaluationResult({ data: job, report });
        setAiUrl(job['Job Link'] || '');
        setResumeProfile(job['Resume Profile'] || 'sde');
        setChosenRecruiterUrl(job['Chosen Recruiter URL'] || '');
        setChosenManagerUrl(job['Chosen Manager URL'] || '');
        setActiveTab('evaluator');
        window.scrollTo(0, 0);
      } catch (e) {
        console.error("Could not parse report json", e);
      }
    }
  };

  const handleContactoSubmit = async (e) => {
    e.preventDefault();
    setIsContactoLoading(true);
    setContactoResult(null);
    try {
      const res = await generateContacto({ ...contactoData, model: selectedModel });
      setContactoResult(res.message);
    } catch (err) {
      alert('Failed to generate outreach message.');
    } finally {
      setIsContactoLoading(false);
    }
  };

  const handleDeepSubmit = async (e) => {
    e.preventDefault();
    setIsDeepLoading(true);
    try {
      const res = await generateDeep({ ...deepData, model: selectedModel });
      setDeepResult(res.research);
    } catch (err) {
      setError('Deep research error: ' + err.message);
    } finally {
      setIsDeepLoading(false);
    }
  };

  const handlePdfSubmit = async (e) => {
    e.preventDefault();
    setIsPdfLoading(true);
    try {
      const res = await generatePdf({ ...pdfData, model: selectedModel });
      setPdfResult(`CV PDF generated at: ${res.downloadUrl}`);
    } catch (err) {
      setError('PDF Generation error: ' + err.message);
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleCoverSubmit = async (e) => {
    e.preventDefault();
    setIsCoverLoading(true);
    try {
      const res = await generateCover({ ...coverData, model: selectedModel });
      setCoverResult(`Cover letter PDF available at: ${res.downloadUrl}`);
    } catch (err) {
      setError('Cover Letter error: ' + err.message);
    } finally {
      setIsCoverLoading(false);
    }
  };

  const appliedApplications = jobs.filter(j => {
    const s = (j.Status || '').toLowerCase();
    return s.includes('applied');
  }).length;

  return (
    <div className={`app-layout ${isSidebarOpen ? '' : 'sidebar-closed'}`}>
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? '' : 'closed'}`}>
        <div className="sidebar-header">
          <Rocket className="header-icon" size={24} />
          <h2>Career Ops</h2>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracker')}
          >
            <LayoutDashboard size={18} /> Application Tracker
          </button>
          <button 
            className={`nav-btn ${activeTab === 'evaluator' ? 'active' : ''}`}
            onClick={() => setActiveTab('evaluator')}
          >
            <Target size={18} /> Job Evaluator
          </button>
          <button 
            className={`nav-btn ${activeTab === 'outreach' ? 'active' : ''}`}
            onClick={() => setActiveTab('outreach')}
          >
            <MessageSquare size={18} /> Outreach & Research
          </button>
          <button 
            className={`nav-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <FileText size={18} /> CV & Cover Letters
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="top-bar" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 2rem', borderBottom: '1px solid #e2e8f0', backgroundColor: 'white', marginBottom: '2rem', sticky: 'top', zIndex: 10 }}>
          <div className="model-selector" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label htmlFor="model-select" style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600 }}>Gemini Model:</label>
            <select 
              id="model-select"
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#0f172a', fontSize: '0.875rem', outline: 'none', cursor: 'pointer', fontWeight: 500 }}
            >
              <optgroup label="Gemini (Google)">
                <option value="gemini-flash-latest">gemini-flash-latest (Recommended Alias)</option>
                <option value="gemini-3.5-flash">gemini-3.5-flash (Flagship Free Tier)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (High Speed Pipeline)</option>
                <option value="gemini-2.5-flash">gemini-2.5-flash (Legacy Fallback)</option>
                <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Legacy Fallback)</option>
              </optgroup>
              <optgroup label="Groq (Fast Open-Source)">
                <option value="openai/gpt-oss-120b">gpt-oss-120b</option>
                <option value="openai/gpt-oss-20b">gpt-oss-20b</option>
                <option value="qwen/qwen3.6-27b">qwen3.6-27b</option>
                <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
              </optgroup>
            </select>
          </div>
        </div>
        {error && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>{error}</span>
            <button className="close-btn" onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* --- TRACKER TAB --- */}
        {activeTab === 'tracker' && (
          <div className="tab-pane fade-in">
            <div className="tab-header">
              <h1>Dashboard Overview</h1>
              <p>Monitor your active applications and overall pipeline health.</p>
            </div>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon-wrapper blue"><Briefcase size={24} /></div>
                <div className="stat-content">
                  <h3>Total Tracked</h3>
                  <p>{jobs.length}</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-wrapper green"><Clock size={24} /></div>
                <div className="stat-content">
                  <h3>Applied</h3>
                  <p>{appliedApplications}</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-wrapper purple"><Building2 size={24} /></div>
                <div className="stat-content">
                  <h3>Companies</h3>
                  <p>{new Set(jobs.map(j => j.Company).filter(Boolean)).size}</p>
                </div>
              </div>
            </div>

            <section className="table-container">
              <div className="table-header">
                <h2><CheckCircle2 size={20} style={{ color: '#6366f1' }} /> Application Pipeline</h2>
              </div>
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Role</th>
                      <th>Job ID</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Resume</th>
                      <th>Date Applied</th>
                      <th>Recruiter Search</th>
                      <th>Chosen Recruiter</th>
                      <th>Manager Search</th>
                      <th>Chosen Manager</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan="10">
                          <div className="empty-state">
                            <Briefcase size={48} className="empty-icon" />
                            <p>No applications tracked yet. Start by evaluating a job!</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      [...jobs].reverse().map((job, index) => (
                        <tr key={index} onClick={() => handleRowClick(job)} style={{ cursor: job.Raw_Report_JSON ? 'pointer' : 'default' }}>
                          <td>
                            <div className="company-cell">
                              <div className="company-logo-placeholder">
                                {(job.Company || '?').charAt(0).toUpperCase()}
                              </div>
                              {job.Company || 'Unknown'}
                            </div>
                          </td>
                          <td>
                            {job['Job Link'] ? (
                              <a href={job['Job Link']} target="_blank" rel="noreferrer" className="role-link">
                                {job['Job Role'] || 'Unknown Role'} <ExternalLink size={12} />
                              </a>
                            ) : (
                              <span className="fw-500">{job['Job Role'] || 'Unknown Role'}</span>
                            )}
                          </td>
                          <td className="text-muted">{job['Job ID'] || '-'}</td>
                          <td>
                            <select 
                              value={job.Status || 'Evaluated'}
                              onChange={(e) => handleStatusChange(e, job)}
                              onClick={(e) => e.stopPropagation()}
                              className={`status-badge ${(job.Status || '').toLowerCase().replace(/\s+/g, '-')}`}
                              style={{ appearance: 'auto', border: 'none', cursor: 'pointer', outline: 'none' }}
                            >
                              <option value="Evaluated">Evaluated</option>
                              <option value="Applied">Applied</option>
                              <option value="Got OA">Got OA</option>
                              <option value="Interviewing">Interviewing</option>
                              <option value="Offered">Offered</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          </td>
                          <td>
                            {job.Score ? <span className="score-badge">{job.Score}/5</span> : '-'}
                          </td>
                          <td>
                            {job['Resume Profile'] ? <span className="status-badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>{job['Resume Profile'].toUpperCase()}</span> : '-'}
                          </td>
                          <td className="text-muted">{job['Date Applied'] || '-'}</td>
                          <td>
                            {job['Recruiter URL'] && job['Recruiter URL'].startsWith('http') ? (
                              <a href={job['Recruiter URL']} target="_blank" rel="noreferrer" title="Recruiter Search"><ExternalLink size={16} /></a>
                            ) : '-'}
                          </td>
                          <td>
                            {job['Chosen Recruiter URL'] && job['Chosen Recruiter URL'].startsWith('http') ? (
                              <a href={job['Chosen Recruiter URL']} target="_blank" rel="noreferrer" title="Chosen Recruiter Profile"><ExternalLink size={16} /></a>
                            ) : '-'}
                          </td>
                          <td>
                            {job['Hiring Manager URL'] && job['Hiring Manager URL'].startsWith('http') ? (
                              <a href={job['Hiring Manager URL']} target="_blank" rel="noreferrer" title="Manager Search"><ExternalLink size={16} /></a>
                            ) : '-'}
                          </td>
                          <td>
                            {job['Chosen Manager URL'] && job['Chosen Manager URL'].startsWith('http') ? (
                              <a href={job['Chosen Manager URL']} target="_blank" rel="noreferrer" title="Chosen Manager Profile"><ExternalLink size={16} /></a>
                            ) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* --- EVALUATOR TAB --- */}
        {activeTab === 'evaluator' && (
          <div className="tab-pane fade-in">
             <div className="tab-header">
              <h1>AI Job Evaluator</h1>
              <p>Analyze job postings, uncover recruiter details, and decide if you want to apply.</p>
            </div>

            <section className="card-box mb-6">
              <form onSubmit={handleAIEvaluate} className="evaluator-form">
                <div className="eval-input-grid">
                  <div className="eval-col-main">
                    <div className="form-group">
                      <label>Job Posting URL <span className="req">*</span></label>
                      <div className="input-with-icon">
                        <LinkIcon className="input-icon" size={18} />
                        <input
                          type="url"
                          placeholder="https://greenhouse.io/... or linkedin.com/..."
                          value={aiUrl}
                          onChange={(e) => setAiUrl(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Raw Job Description (Optional)</label>
                      <textarea 
                        rows="3"
                        placeholder="Paste text here if the job requires a login..."
                        value={aiText}
                        onChange={(e) => setAiText(e.target.value)}
                      ></textarea>
                    </div>
                  </div>
                  
                  <div className="eval-col-side">
                    <div className="form-group">
                      <label>Target Profile</label>
                      <select 
                        value={resumeProfile}
                        onChange={(e) => setResumeProfile(e.target.value)}
                      >
                        <option value="sde">Software Engineer (SDE)</option>
                        <option value="cloud-devops">Cloud / DevOps</option>
                        <option value="cybersec">Cybersecurity</option>
                        <option value="systems">Systems Software</option>
                        <option value="ai">AI / ML</option>
                      </select>
                      <p className="help-text">Select which CV profile you want to compare against this job.</p>
                    </div>
                    
                    <button type="submit" className="eval-submit-btn" disabled={isEvaluating}>
                      {isEvaluating ? <><Loader2 size={20} className="spinner" /> Analyzing Match...</> : <><Sparkles size={20} /> Run Evaluation</>}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {evaluationResult && evaluationResult.report && (
              <div className="evaluation-report fade-in">
                <div className="report-header">
                  <div>
                    <h2 className="report-title">{evaluationResult.data.Role}</h2>
                    <h3 className="report-company">{evaluationResult.data.Company}</h3>
                  </div>
                  <div className="report-score">
                    <span className="score-number">{evaluationResult.report.match_score}</span>
                    <span className="score-label">Match Score</span>
                  </div>
                </div>

                <p className="report-summary">{evaluationResult.report.evaluation_summary}</p>
                
                <div className="report-grid">
                  <div className="report-box pros">
                    <h4><CheckCircle2 size={16} /> Key Pros</h4>
                    <ul>
                      {evaluationResult.report.pros.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                  <div className="report-box cons">
                    <h4><AlertCircle size={16} /> Potential Cons</h4>
                    <ul>
                      {evaluationResult.report.cons.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                </div>

                <div className="chat-box" style={{ backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '2rem', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MessageSquare size={18} /> Application Q&A Chat</h4>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <textarea 
                      placeholder="e.g. Help me answer 'Why do you want to join us?' based on my CV..." 
                      className="url-input" 
                      style={{ flex: 1, padding: '0.75rem 1rem', resize: 'vertical', minHeight: '80px', fontFamily: 'inherit' }}
                      value={chatInput} 
                      onChange={(e) => setChatInput(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAskChat();
                        }
                      }}
                    />
                    <button 
                      onClick={handleAskChat} 
                      className="eval-submit-btn" 
                      disabled={isChatLoading || !chatInput.trim()}
                      style={{ width: 'auto', padding: '0.5rem 1.5rem', fontSize: '0.9rem', backgroundColor: '#3b82f6', alignSelf: 'flex-start' }}
                    >
                      {isChatLoading ? <><Loader2 size={16} className="spinner" /> Thinking...</> : <><Send size={16} /> Ask AI</>}
                    </button>
                  </div>
                  {chatResult && (
                    <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{chatResult}</ReactMarkdown>
                    </div>
                  )}
                </div>

                <div className="recruiter-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>Identified Contacts</h4>
                    {!contactsResult && (
                      <button 
                        onClick={handleFindContacts} 
                        className="eval-submit-btn" 
                        disabled={isFindingContacts}
                        style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                      >
                        {isFindingContacts ? <><Loader2 size={16} className="spinner" /> Finding...</> : <><Search size={16} /> Find Contacts</>}
                      </button>
                    )}
                  </div>

                  {contactsResult && (
                    <>
                      <div className="contact-row mb-4">
                        <p><strong>Recruiter Search:</strong> {
                          contactsResult.recruiterUrl?.startsWith('http') 
                            ? <a href={contactsResult.recruiterUrl} target="_blank" rel="noreferrer">LinkedIn Search</a> 
                            : (contactsResult.recruiterUrl || 'Not found')
                        }</p>
                        <input 
                          type="url" 
                          placeholder="Paste chosen Recruiter LinkedIn URL here" 
                          className="url-input" 
                          style={{ marginTop: '0.5rem', padding: '0.5rem 1rem' }}
                          value={chosenRecruiterUrl} 
                          onChange={(e) => setChosenRecruiterUrl(e.target.value)} 
                        />
                      </div>
                      <div className="contact-row">
                        <p><strong>Hiring Manager Search:</strong> {
                          contactsResult.managerUrl?.startsWith('http') 
                            ? <a href={contactsResult.managerUrl} target="_blank" rel="noreferrer">LinkedIn Search</a> 
                            : (contactsResult.managerUrl || 'Not found')
                        }</p>
                        <input 
                          type="url" 
                          placeholder="Paste chosen Manager LinkedIn URL here" 
                          className="url-input" 
                          style={{ marginTop: '0.5rem', padding: '0.5rem 1rem' }}
                          value={chosenManagerUrl} 
                          onChange={(e) => setChosenManagerUrl(e.target.value)} 
                        />
                      </div>
                      <div className="contact-row mt-4" style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px dashed #cbd5e1' }}>
                        <p style={{ margin: 0 }}><strong>Predicted Email Format:</strong> <span style={{ fontFamily: 'monospace', color: '#475569', backgroundColor: '#e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', marginLeft: '0.5rem' }}>{contactsResult.emailFormat || 'Not found'}</span></p>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem', marginBottom: 0 }}>Use this format when generating cold emails if you find the recruiter's name.</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="emails-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>{evaluationResult.report.recruiter_email || evaluationResult.report.manager_email ? 'Generated Cold Emails' : ''}</h4>
                    <button 
                      onClick={handleGenerateEmails} 
                      className="eval-submit-btn" 
                      style={{ backgroundColor: '#8b5cf6', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                      disabled={isGeneratingEmails}
                    >
                      {isGeneratingEmails ? <><Loader2 size={16} className="spinner" /> Generating...</> : <><MessageSquare size={16} /> {evaluationResult.report.recruiter_email ? 'Regenerate Emails' : 'Generate Cold Emails'}</>}
                    </button>
                  </div>
                  
                  {(evaluationResult.report.recruiter_email || evaluationResult.report.manager_email) && (
                    <div className="report-grid">
                      {evaluationResult.report.recruiter_email && (
                        <div className="email-preview-box">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h5 style={{ margin: 0 }}>Recruiter Email</h5>
                            <button onClick={() => copyRichText('recruiter-email-content')} className="copy-btn">Copy</button>
                          </div>
                          <div id="recruiter-email-content" className="email-markdown">
                            <ReactMarkdown components={{ p: ({node, ...props}) => <div style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5em' }} {...props} /> }}>
                              {evaluationResult.report.recruiter_email}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                      {evaluationResult.report.manager_email && (
                        <div className="email-preview-box">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h5 style={{ margin: 0 }}>Hiring Manager Email</h5>
                            <button onClick={() => copyRichText('manager-email-content')} className="copy-btn">Copy</button>
                          </div>
                          <div id="manager-email-content" className="email-markdown">
                            <ReactMarkdown components={{ p: ({node, ...props}) => <div style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5em' }} {...props} /> }}>
                              {evaluationResult.report.manager_email}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="report-actions">
                  <button className="apply-btn" onClick={handleApplyToTracker}>
                    <Briefcase size={18} /> Mark as Applied & Add to Tracker
                  </button>
                  <button className="cancel-btn" onClick={() => setEvaluationResult(null)}>
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- OUTREACH & RESEARCH TAB --- */}
        {activeTab === 'outreach' && (
          <div className="tab-pane fade-in">
            <div className="tab-header">
              <h1>Outreach & Research</h1>
              <p>Generate targeted LinkedIn messages and dive deep into company profiles.</p>
            </div>

            <div className="split-grid">
              {/* Contacto Form */}
              <div className="card-box">
                <h2><Send size={20} className="icon-blue" /> Outreach Generator</h2>
                <p className="text-muted text-sm mb-4">Generate targeted connection requests and emails.</p>
                <form onSubmit={handleContactoSubmit} className="stacked-form">
                  <textarea 
                    placeholder="Enter details: e.g. Contacting John at Google for the Frontend role. Mention my open source work." 
                    required 
                    value={contactoData.outreachDetails} 
                    onChange={e => setContactoData({...contactoData, outreachDetails: e.target.value})}
                    style={{ minHeight: '120px', resize: 'vertical', padding: '0.75rem', fontFamily: 'inherit', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}
                  />
                  <select value={contactoData.resumeProfile} onChange={e => setContactoData({...contactoData, resumeProfile: e.target.value})}>
                    <option value="sde">Software Engineer (SDE)</option>
                    <option value="cloud-devops">Cloud / DevOps</option>
                    <option value="cybersec">Cybersecurity</option>
                    <option value="systems">Systems / Low Level</option>
                    <option value="ai">AI / ML</option>
                  </select>
                  <button type="submit" disabled={isContactoLoading} className="secondary-btn">
                    {isContactoLoading ? 'Generating...' : 'Generate Message'}
                  </button>
                </form>
                {contactoResult && (
                  <div className="result-box mt-4 markdown-preview">
                    <ReactMarkdown remarkPlugins={[remarkBreaks]}>{contactoResult}</ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Deep Research Form */}
              <div className="card-box">
                <h2><BookOpen size={20} className="icon-purple" /> Deep Company Research</h2>
                <p className="text-muted text-sm mb-4">Get a comprehensive company brief.</p>
                <form onSubmit={handleDeepSubmit} className="stacked-form">
                  <textarea 
                    placeholder="Company Name or detailed research request..." 
                    required 
                    value={deepData.company} 
                    onChange={e => setDeepData({...deepData, company: e.target.value})}
                    style={{ minHeight: '80px', resize: 'vertical', padding: '0.75rem', fontFamily: 'inherit', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}
                  />
                  <button type="submit" disabled={isDeepLoading} className="secondary-btn">
                    {isDeepLoading ? 'Researching...' : 'Start Research'}
                  </button>
                </form>
                {deepResult && (
                  <div className="result-box mt-4 markdown-preview">
                    <ReactMarkdown remarkPlugins={[remarkBreaks]}>{deepResult}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- CV & COVER LETTER TAB --- */}
        {activeTab === 'documents' && (
          <div className="tab-pane fade-in">
            <div className="tab-header">
              <h1>Document Generator</h1>
              <p>Create ATS-optimized PDFs and personalized cover letters instantly.</p>
            </div>

            <div className="split-grid">
              {/* PDF Form */}
              <div className="card-box">
                <h2><FileText size={20} className="icon-green" /> Resume Tailoring</h2>
                <p className="text-muted text-sm mb-4">Generate an ATS-optimized CV PDF.</p>
                <form onSubmit={handlePdfSubmit} className="stacked-form">
                  <input type="url" placeholder="Paste Job Description URL" required value={pdfData.jobUrl} onChange={e => setPdfData({...pdfData, jobUrl: e.target.value})} />
                  <textarea rows="3" placeholder="Or paste raw Job Description (optional)" value={pdfData.jobText} onChange={e => setPdfData({...pdfData, jobText: e.target.value})}></textarea>
                  <select value={pdfData.resumeProfile} onChange={e => setPdfData({...pdfData, resumeProfile: e.target.value})}>
                    <option value="sde">Software Engineer (SDE)</option>
                    <option value="cloud-devops">Cloud / DevOps</option>
                    <option value="cybersec">Cybersecurity</option>
                    <option value="ai">AI / ML</option>
                    <option value="systems">Systems Software</option>
                  </select>
                  <select value={pdfData.format} onChange={e => setPdfData({...pdfData, format: e.target.value})}>
                    <option value="letter">US Letter (Americas)</option>
                    <option value="a4">A4 (Rest of World)</option>
                  </select>
                  <button type="submit" disabled={isPdfLoading} className="secondary-btn">
                    {isPdfLoading ? 'Compiling PDF...' : 'Generate PDF'}
                  </button>
                </form>
                {pdfResult && (
                  <div className="result-box mt-4 flex items-center justify-between">
                    <p className="text-sm success-text"><CheckCircle2 size={16} className="inline" /> {pdfResult.message}</p>
                    {pdfResult.downloadUrl && pdfResult.downloadUrl !== '#' && (
                      <a href={pdfResult.downloadUrl} target="_blank" rel="noopener noreferrer" className="apply-btn" style={{ textDecoration: 'none', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>
                        View
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Cover Letter Form */}
              <div className="card-box">
                <h2><FileText size={20} className="icon-orange" /> Cover Letter Generator</h2>
                <p className="text-muted text-sm mb-4">Generate a 1-page custom cover letter.</p>
                <form onSubmit={handleCoverSubmit} className="stacked-form">
                  <input type="url" placeholder="Paste Job Description URL" required value={coverData.jobUrl} onChange={e => setCoverData({...coverData, jobUrl: e.target.value})} />
                  <textarea rows="3" placeholder="Or paste raw Job Description (optional)" value={coverData.jobText} onChange={e => setCoverData({...coverData, jobText: e.target.value})}></textarea>
                  <select value={coverData.resumeProfile} onChange={e => setCoverData({...coverData, resumeProfile: e.target.value})}>
                    <option value="sde">Software Engineer (SDE)</option>
                    <option value="cloud-devops">Cloud / DevOps</option>
                    <option value="cybersec">Cybersecurity</option>
                    <option value="ai">AI / ML</option>
                    <option value="systems">Systems Software</option>
                  </select>
                  <button type="submit" disabled={isCoverLoading} className="secondary-btn">
                    {isCoverLoading ? 'Generating PDF...' : 'Generate Cover Letter PDF'}
                  </button>
                </form>
                {coverResult && (
                  <div className="result-box mt-4 flex items-center justify-between">
                    <p className="text-sm success-text"><CheckCircle2 size={16} className="inline" /> {coverResult.message}</p>
                    {coverResult.downloadUrl && (
                      <a href={coverResult.downloadUrl} target="_blank" rel="noopener noreferrer" className="apply-btn" style={{ textDecoration: 'none', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>
                        View
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

