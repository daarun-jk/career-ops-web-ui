const API_BASE_URL = `http://${window.location.hostname}:3000/api`;

export const fetchJobs = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs`);
    if (!response.ok) throw new Error('Network response was not ok');
    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
};

export const addJob = async (jobData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobData),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to add job');
      throw new Error(errorMsg);
    }
    return result.data;
  } catch (error) {
    console.error('Error adding job:', error);
    throw error;
  }
};

export const evaluateJobWithAI = async (jobUrl, jobText, resumeProfile, model) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: jobUrl, text: jobText, resumeProfile, model }),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to evaluate job');
      throw new Error(errorMsg);
    }
    // Result now has data and report
    return result; 
  } catch (error) {
    console.error('Error evaluating job:', error);
    throw error;
  }
};

export const generateEmails = async (jobUrl, jobText, resumeProfile, model) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/generate-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: jobUrl, text: jobText, resumeProfile, model }),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to generate emails');
      throw new Error(errorMsg);
    }
    return result; 
  } catch (error) {
    console.error('Error generating emails:', error);
    throw error;
  }
};

export const findContacts = async (companyName, jobUrl, jobText, model) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company: companyName, url: jobUrl, text: jobText, model }),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to find contacts');
      throw new Error(errorMsg);
    }
    return result; 
  } catch (error) {
    console.error('Error finding contacts:', error);
    throw error;
  }
};

export const askAIChat = async (question, jobUrl, jobText, resumeProfile, model) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, url: jobUrl, text: jobText, resumeProfile, model }),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to get answer');
      throw new Error(errorMsg);
    }
    return result; 
  } catch (error) {
    console.error('Error in AI Chat:', error);
    throw error;
  }
};

export const generateContacto = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/contacto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to generate message');
      throw new Error(errorMsg);
    }
    return result;
  } catch (error) {
    console.error('Error generating contacto:', error);
    throw error;
  }
};

export const generateCover = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to generate cover letter');
      throw new Error(errorMsg);
    }
    return result;
  } catch (error) {
    console.error('Error generating cover letter:', error);
    throw error;
  }
};

export const generateDeep = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/deep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to generate research');
      throw new Error(errorMsg);
    }
    return result;
  } catch (error) {
    console.error('Error generating deep research:', error);
    throw error;
  }
};

export const generatePdf = async (data) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) {
      const errorMsg = result.details ? `${result.error}: ${result.details}` : (result.error || 'Failed to generate PDF');
      throw new Error(errorMsg);
    }
    return result;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
